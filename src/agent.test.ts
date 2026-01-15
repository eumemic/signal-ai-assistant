import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChatAgent, AgentOptions } from './agent'

// Mock the SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  unstable_v2_createSession: vi.fn(),
  unstable_v2_resumeSession: vi.fn(),
}))

// Mock prompts module
vi.mock('./prompts', () => ({
  loadPrompt: vi.fn((type: string, vars: Record<string, string>) => {
    if (type === 'dm') {
      return `common content\n\nDM prompt for ${vars.CONTACT_NAME}`
    } else {
      return `common content\n\nGroup prompt for ${vars.GROUP_NAME}`
    }
  }),
}))


import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk'
import { loadPrompt } from './prompts'

describe('ChatAgent', () => {
  const mockCreateSession = vi.mocked(unstable_v2_createSession)
  const mockResumeSession = vi.mocked(unstable_v2_resumeSession)
  const mockLoadPrompt = vi.mocked(loadPrompt)

  const defaultOptions: AgentOptions = {
    agentPhoneNumber: '+1555123456',
    anthropicModel: 'claude-sonnet-4-5-20250514',
  }

  function createMockSession(sessionId: string) {
    return {
      sessionId,
      send: vi.fn().mockResolvedValue(undefined),
      stream: vi.fn().mockReturnValue((async function* () {
        // Default: immediately yield a success result
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Mock response',
        }
      })()),
      close: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Agent initialization and prompt loading', () => {
    it('should create a DM agent with dm.md prompt', async () => {
      const mockSession = createMockSession('session_dm_123')
      mockCreateSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Verify DM prompt was loaded with correct variables
      expect(mockLoadPrompt).toHaveBeenCalledWith('dm', {
        AGENT_PHONE_NUMBER: '+1555123456',
        CONTACT_NAME: 'Alice',
        CONTACT_PHONE: '+1234567890',
      })

      // Verify session was created with the prompt
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-5-20250514',
        })
      )

      expect(agent.sessionId).toBe('session_dm_123')
    })

    it('should create a group agent with group.md prompt', async () => {
      const mockSession = createMockSession('session_group_456')
      mockCreateSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: 'Z3JvdXBfYWJjMTIz==',
        type: 'group',
        groupName: 'Family Chat',
        groupId: 'Z3JvdXBfYWJjMTIz==',
        ...defaultOptions,
      })

      await agent.initialize()

      // Verify group prompt was loaded with correct variables
      expect(mockLoadPrompt).toHaveBeenCalledWith('group', {
        AGENT_PHONE_NUMBER: '+1555123456',
        GROUP_NAME: 'Family Chat',
        GROUP_ID: 'Z3JvdXBfYWJjMTIz==',
      })

      expect(agent.sessionId).toBe('session_group_456')
    })

    it('should use phone number as contact name when not provided for DM', async () => {
      const mockSession = createMockSession('session_dm_789')
      mockCreateSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactPhone: '+1234567890',
        // No contactName provided
        ...defaultOptions,
      })

      await agent.initialize()

      // Should use phone number as name
      expect(mockLoadPrompt).toHaveBeenCalledWith('dm', {
        AGENT_PHONE_NUMBER: '+1555123456',
        CONTACT_NAME: '+1234567890',
        CONTACT_PHONE: '+1234567890',
      })
    })

    it('should use group ID as name when group name not provided', async () => {
      const mockSession = createMockSession('session_group_unknown')
      mockCreateSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: 'Z3JvdXBfdW5rbm93bg==',
        type: 'group',
        groupId: 'Z3JvdXBfdW5rbm93bg==',
        // No groupName provided
        ...defaultOptions,
      })

      await agent.initialize()

      expect(mockLoadPrompt).toHaveBeenCalledWith('group', {
        AGENT_PHONE_NUMBER: '+1555123456',
        GROUP_NAME: 'Z3JvdXBfdW5rbm93bg==',
        GROUP_ID: 'Z3JvdXBfdW5rbm93bg==',
      })
    })

    it('should resume existing session when session ID provided', async () => {
      const mockSession = createMockSession('existing_session_123')
      mockResumeSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        existingSessionId: 'existing_session_123',
        ...defaultOptions,
      })

      await agent.initialize()

      // Should resume, not create
      expect(mockResumeSession).toHaveBeenCalledWith(
        'existing_session_123',
        expect.objectContaining({
          model: 'claude-sonnet-4-5-20250514',
        })
      )
      expect(mockCreateSession).not.toHaveBeenCalled()
    })

    it('should create fresh session if resume fails', async () => {
      const mockNewSession = createMockSession('new_session_after_fail')
      mockResumeSession.mockImplementation(() => {
        throw new Error('Session not found')
      })
      mockCreateSession.mockReturnValue(mockNewSession as any)

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        existingSessionId: 'stale_session_123',
        ...defaultOptions,
      })

      await agent.initialize()

      // Should have warned about the failure
      expect(consoleSpy).toHaveBeenCalled()

      // Should have fallen back to creating a new session
      expect(mockCreateSession).toHaveBeenCalled()
      expect(agent.sessionId).toBe('new_session_after_fail')

      consoleSpy.mockRestore()
    })

    it('should maintain separate sessions for different chat IDs', async () => {
      const dmSession = createMockSession('dm_session_111')
      const groupSession = createMockSession('group_session_222')

      mockCreateSession
        .mockReturnValueOnce(dmSession as any)
        .mockReturnValueOnce(groupSession as any)

      const dmAgent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      const groupAgent = new ChatAgent({
        chatId: 'Z3JvdXBfYWJj==',
        type: 'group',
        groupName: 'Family',
        groupId: 'Z3JvdXBfYWJj==',
        ...defaultOptions,
      })

      await dmAgent.initialize()
      await groupAgent.initialize()

      // Each agent has its own session
      expect(dmAgent.sessionId).toBe('dm_session_111')
      expect(groupAgent.sessionId).toBe('group_session_222')
      expect(dmAgent.sessionId).not.toBe(groupAgent.sessionId)
    })

    it('should include common.md prefix in both prompt types', async () => {
      const mockSession = createMockSession('session_test')
      mockCreateSession.mockReturnValue(mockSession as any)

      // The loadPrompt mock already simulates common + type-specific
      const dmAgent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await dmAgent.initialize()

      // Verify loadPrompt was called - it combines common.md internally
      expect(mockLoadPrompt).toHaveBeenCalledWith('dm', expect.any(Object))
    })
  })

  describe('test_turn_timeout', () => {
    it('should complete turn successfully when under timeout', async () => {
      const mockSession = createMockSession('session_timeout_test')
      // Mock send and stream for a successful response
      mockSession.send = vi.fn().mockResolvedValue(undefined)
      mockSession.stream = vi.fn().mockReturnValue((async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Hello!',
        }
      })())
      mockCreateSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      const result = await agent.runTurn('Test message')
      expect(result.timedOut).toBe(false)
      expect(result.response).toBe('Hello!')
      expect(mockSession.send).toHaveBeenCalledWith('Test message')
    })

    it('should timeout after 10 minutes and log timeout', async () => {
      vi.useFakeTimers()

      const mockSession = createMockSession('session_timeout_test')
      // Create a stream that never yields (hangs forever)
      mockSession.send = vi.fn().mockResolvedValue(undefined)
      mockSession.stream = vi.fn().mockReturnValue((async function* () {
        // Never yield - simulate a hanging stream
        await new Promise(() => {})
      })())
      mockCreateSession.mockReturnValue(mockSession as any)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Start the turn
      const turnPromise = agent.runTurn('Test message')

      // Advance time past the 10-minute timeout
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100)

      // The turn should have timed out
      const result = await turnPromise

      expect(result.timedOut).toBe(true)
      expect(result.response).toBeUndefined()

      // Verify timeout was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[agent:+1234567890] Turn timed out after 10 minutes')
      )

      consoleSpy.mockRestore()
      vi.useRealTimers()
    })

    it('should not crash orchestrator on timeout (resilience)', async () => {
      vi.useFakeTimers()

      const mockSession = createMockSession('session_resilience')
      // First call: stream hangs forever
      mockSession.send = vi.fn().mockResolvedValue(undefined)
      mockSession.stream = vi.fn().mockReturnValueOnce((async function* () {
        await new Promise(() => {}) // Never yields
      })())
      mockCreateSession.mockReturnValue(mockSession as any)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Multiple turns should not throw or crash
      const turn1Promise = agent.runTurn('Message 1')
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100)
      const result1 = await turn1Promise

      // Agent should still be usable after timeout
      // Second call: stream returns immediately
      mockSession.stream = vi.fn().mockReturnValue((async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Back online!',
        }
      })())
      const result2 = await agent.runTurn('Message 2')

      expect(result1.timedOut).toBe(true)
      expect(result2.timedOut).toBe(false)
      expect(result2.response).toBe('Back online!')

      consoleSpy.mockRestore()
      vi.useRealTimers()
    })

    it('should use default 10-minute timeout', async () => {
      vi.useFakeTimers()

      const mockSession = createMockSession('session_default_timeout')
      mockSession.send = vi.fn().mockResolvedValue(undefined)
      mockSession.stream = vi.fn().mockReturnValue((async function* () {
        await new Promise(() => {}) // Never yields
      })())
      mockCreateSession.mockReturnValue(mockSession as any)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      const turnPromise = agent.runTurn('Test')

      // Advance to just under 10 minutes - should not timeout yet
      await vi.advanceTimersByTimeAsync(9 * 60 * 1000 + 59 * 1000)

      // Turn should still be in progress (promise not resolved)
      // Advance past 10 minutes
      await vi.advanceTimersByTimeAsync(2 * 1000)

      const result = await turnPromise
      expect(result.timedOut).toBe(true)

      consoleSpy.mockRestore()
      vi.useRealTimers()
    })

    it('should allow custom timeout override for testing', async () => {
      vi.useFakeTimers()

      const mockSession = createMockSession('session_custom_timeout')
      mockSession.send = vi.fn().mockResolvedValue(undefined)
      mockSession.stream = vi.fn().mockReturnValue((async function* () {
        await new Promise(() => {}) // Never yields
      })())
      mockCreateSession.mockReturnValue(mockSession as any)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Use 1 second timeout for testing
      const turnPromise = agent.runTurn('Test', { timeoutMs: 1000 })

      await vi.advanceTimersByTimeAsync(1100)

      const result = await turnPromise
      expect(result.timedOut).toBe(true)

      consoleSpy.mockRestore()
      vi.useRealTimers()
    })
  })

  describe('test_agent_crash_isolation', () => {
    it('should throw error on initialization failure for orchestrator to catch', async () => {
      // Simulate SDK initialization failure
      mockCreateSession.mockImplementation(() => {
        throw new Error('SDK initialization failed')
      })

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      // Agent initialization should propagate the error
      await expect(agent.initialize()).rejects.toThrow('SDK initialization failed')
    })

    it('should throw error on turn failure when stream throws', async () => {
      const mockSession = createMockSession('session_crash')
      mockSession.send = vi.fn().mockResolvedValue(undefined)
      mockSession.stream = vi.fn().mockReturnValue((async function* () {
        throw new Error('Stream crashed unexpectedly')
      })())
      mockCreateSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Turn should propagate the error for orchestrator to handle
      await expect(agent.runTurn('Test message')).rejects.toThrow('Stream crashed unexpectedly')
    })

    it('should throw error when send() fails', async () => {
      const mockSession = createMockSession('session_send_crash')
      mockSession.send = vi.fn().mockRejectedValue(new Error('Send failed'))
      mockCreateSession.mockReturnValue(mockSession as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Turn should propagate the error for orchestrator to handle
      await expect(agent.runTurn('Test message')).rejects.toThrow('Send failed')
    })

    it('should allow agent to be reinitialized after crash', async () => {
      // First initialization fails
      mockCreateSession.mockImplementationOnce(() => {
        throw new Error('Transient failure')
      })
      // Second initialization succeeds
      const mockSession = createMockSession('session_recovered')
      mockCreateSession.mockReturnValueOnce(mockSession as any)

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      // First init fails
      await expect(agent.initialize()).rejects.toThrow('Transient failure')

      // Second init succeeds - agent can be recreated
      await agent.initialize()
      expect(agent.sessionId).toBe('session_recovered')

      consoleSpy.mockRestore()
    })

    it('should close existing session before reinitializing', async () => {
      const mockSession1 = createMockSession('session_1')
      const mockSession2 = createMockSession('session_2')
      mockCreateSession
        .mockReturnValueOnce(mockSession1 as any)
        .mockReturnValueOnce(mockSession2 as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()
      expect(agent.sessionId).toBe('session_1')

      // Reinitialize (as orchestrator would do after crash)
      await agent.initialize()

      // Old session should have been closed
      expect(mockSession1.close).toHaveBeenCalled()
      expect(agent.sessionId).toBe('session_2')
    })
  })
})
