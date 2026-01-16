import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChatAgent, AgentOptions } from './agent'

// Mock the SDK - now using V1 query() API
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Mock prompts module
vi.mock('./prompts', () => ({
  loadPrompt: vi.fn((type: string, vars: Record<string, string>) => {
    if (type === 'dm') {
      return `common content\n\nDM prompt for ${vars.CONTACT_NAME}`
    } else {
      return `common content\n\nGroup prompt for ${vars.GROUP_NAME}\nSend: ${vars.SEND_SCRIPT}`
    }
  }),
}))

import { query } from '@anthropic-ai/claude-agent-sdk'
import { loadPrompt } from './prompts'

describe('ChatAgent', () => {
  const mockQuery = vi.mocked(query)
  const mockLoadPrompt = vi.mocked(loadPrompt)

  const defaultOptions: AgentOptions = {
    agentPhoneNumber: '+1555123456',
    anthropicModel: 'claude-sonnet-4-5-20250514',
  }

  function createMockQueryIterator(sessionId: string, result: string = 'Mock response') {
    const iterator = (async function* () {
      yield {
        type: 'system',
        session_id: sessionId,
      }
      yield {
        type: 'result',
        subtype: 'success',
        result,
        session_id: sessionId,
      }
    })()
    return iterator
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Agent initialization and prompt loading', () => {
    it('should create a DM agent with dm.md prompt', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_dm_123') as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Initialize doesn't load prompt - it's loaded on runTurn
      // Just verify agent was created correctly
      expect(agent.chatId).toBe('+1234567890')
      expect(agent.type).toBe('dm')
    })

    it('should create a group agent', async () => {
      const agent = new ChatAgent({
        chatId: 'Z3JvdXBfYWJjMTIz==',
        type: 'group',
        groupName: 'Family Chat',
        groupId: 'Z3JvdXBfYWJjMTIz==',
        ...defaultOptions,
      })

      await agent.initialize()

      expect(agent.chatId).toBe('Z3JvdXBfYWJjMTIz==')
      expect(agent.type).toBe('group')
    })

    it('should load DM prompt with correct variables on runTurn', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_dm_123') as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()
      await agent.runTurn('Hello')

      // Verify DM prompt was loaded with correct variables
      expect(mockLoadPrompt).toHaveBeenCalledWith('dm', {
        AGENT_PHONE_NUMBER: '+1555123456',
        CONTACT_NAME: 'Alice',
        CONTACT_PHONE: '+1234567890',
      })
    })

    it('should load group prompt with SEND_SCRIPT variable on runTurn', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_group_456') as any)

      const agent = new ChatAgent({
        chatId: 'Z3JvdXBfYWJjMTIz==',
        type: 'group',
        groupName: 'Family Chat',
        groupId: 'Z3JvdXBfYWJjMTIz==',
        ...defaultOptions,
      })

      await agent.initialize()
      await agent.runTurn('Hello')

      // Verify group prompt was loaded with SEND_SCRIPT variable
      expect(mockLoadPrompt).toHaveBeenCalledWith('group', expect.objectContaining({
        AGENT_PHONE_NUMBER: '+1555123456',
        GROUP_NAME: 'Family Chat',
        SEND_SCRIPT: expect.stringContaining('signal-send.sh'),
      }))
    })

    it('should use phone number as contact name when not provided for DM', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_dm_789') as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactPhone: '+1234567890',
        // No contactName provided
        ...defaultOptions,
      })

      await agent.initialize()
      await agent.runTurn('Hello')

      // Should use phone number as name
      expect(mockLoadPrompt).toHaveBeenCalledWith('dm', {
        AGENT_PHONE_NUMBER: '+1555123456',
        CONTACT_NAME: '+1234567890',
        CONTACT_PHONE: '+1234567890',
      })
    })

    it('should use group ID as name when group name not provided', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_group_unknown') as any)

      const agent = new ChatAgent({
        chatId: 'Z3JvdXBfdW5rbm93bg==',
        type: 'group',
        groupId: 'Z3JvdXBfdW5rbm93bg==',
        // No groupName provided
        ...defaultOptions,
      })

      await agent.initialize()
      await agent.runTurn('Hello')

      expect(mockLoadPrompt).toHaveBeenCalledWith('group', expect.objectContaining({
        AGENT_PHONE_NUMBER: '+1555123456',
        GROUP_NAME: 'Z3JvdXBfdW5rbm93bg==',
      }))
    })

    it('should resume existing session via resume option', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('existing_session_123') as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        existingSessionId: 'existing_session_123',
        ...defaultOptions,
      })

      await agent.initialize()
      await agent.runTurn('Hello')

      // Should pass resume option to query
      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
        options: expect.objectContaining({
          resume: 'existing_session_123',
        }),
      }))
    })

    it('should maintain separate sessions for different chat IDs', async () => {
      mockQuery
        .mockReturnValueOnce(createMockQueryIterator('dm_session_111') as any)
        .mockReturnValueOnce(createMockQueryIterator('group_session_222') as any)

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

      await dmAgent.runTurn('DM message')
      await groupAgent.runTurn('Group message')

      // Each agent has its own session
      expect(dmAgent.sessionId).toBe('dm_session_111')
      expect(groupAgent.sessionId).toBe('group_session_222')
      expect(dmAgent.sessionId).not.toBe(groupAgent.sessionId)
    })
  })

  describe('test_turn_timeout', () => {
    it('should complete turn successfully when under timeout', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_timeout_test', 'Hello!') as any)

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
      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'Test message',
      }))
    })

    it('should timeout after 10 minutes and log timeout', async () => {
      vi.useFakeTimers()

      // Create a query that never yields a result
      mockQuery.mockReturnValue((async function* () {
        await new Promise(() => {}) // Never resolves
      })() as any)

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

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // First call: query hangs forever
      mockQuery.mockReturnValueOnce((async function* () {
        await new Promise(() => {}) // Never yields
      })() as any)
      // Second call: query returns immediately
      mockQuery.mockReturnValueOnce(createMockQueryIterator('session_2', 'Back online!') as any)

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
      vi.useRealTimers()
      const result2 = await agent.runTurn('Message 2')

      expect(result1.timedOut).toBe(true)
      expect(result2.timedOut).toBe(false)
      expect(result2.response).toBe('Back online!')

      consoleSpy.mockRestore()
    })

    it('should use default 10-minute timeout', async () => {
      vi.useFakeTimers()

      mockQuery.mockReturnValue((async function* () {
        await new Promise(() => {}) // Never yields
      })() as any)

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

      mockQuery.mockReturnValue((async function* () {
        await new Promise(() => {}) // Never yields
      })() as any)

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
    it('should throw error on turn failure when query throws', async () => {
      mockQuery.mockReturnValue((async function* () {
        throw new Error('Query crashed unexpectedly')
      })() as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // Turn should propagate the error for orchestrator to handle
      await expect(agent.runTurn('Test message')).rejects.toThrow('Query crashed unexpectedly')
    })

    it('should allow agent to run multiple turns after recovery', async () => {
      // First query fails
      mockQuery.mockReturnValueOnce((async function* () {
        throw new Error('Transient failure')
      })() as any)
      // Second query succeeds
      mockQuery.mockReturnValueOnce(createMockQueryIterator('session_recovered', 'Recovered!') as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        ...defaultOptions,
      })

      await agent.initialize()

      // First turn fails
      await expect(agent.runTurn('First')).rejects.toThrow('Transient failure')

      // Second turn succeeds - agent can recover
      const result = await agent.runTurn('Second')
      expect(result.response).toBe('Recovered!')
    })
  })

  describe('useGroupBehavior option', () => {
    it('should use group prompt for DM when useGroupBehavior is true', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_test') as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        useGroupBehavior: true,
        ...defaultOptions,
      })

      await agent.initialize()
      await agent.runTurn('Hello')

      // Should load group prompt instead of dm prompt
      expect(mockLoadPrompt).toHaveBeenCalledWith('group', expect.objectContaining({
        AGENT_PHONE_NUMBER: '+1555123456',
        GROUP_NAME: expect.stringContaining('DM with'),
        SEND_SCRIPT: expect.stringContaining('signal-send.sh'),
      }))
    })

    it('should use dm prompt for DM when useGroupBehavior is false', async () => {
      mockQuery.mockReturnValue(createMockQueryIterator('session_test') as any)

      const agent = new ChatAgent({
        chatId: '+1234567890',
        type: 'dm',
        contactName: 'Alice',
        contactPhone: '+1234567890',
        useGroupBehavior: false,
        ...defaultOptions,
      })

      await agent.initialize()
      await agent.runTurn('Hello')

      expect(mockLoadPrompt).toHaveBeenCalledWith('dm', expect.any(Object))
    })
  })
})
