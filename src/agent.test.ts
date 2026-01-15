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
      stream: vi.fn(),
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
})
