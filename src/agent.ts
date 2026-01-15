import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk'
import { loadPrompt } from './prompts'

/**
 * Common options required for all agents.
 */
export interface AgentOptions {
  agentPhoneNumber: string
  anthropicModel: string
}

/**
 * Options for creating a DM agent.
 */
export interface DmAgentConfig extends AgentOptions {
  chatId: string
  type: 'dm'
  contactPhone: string
  contactName?: string
  existingSessionId?: string
}

/**
 * Options for creating a group agent.
 */
export interface GroupAgentConfig extends AgentOptions {
  chatId: string
  type: 'group'
  groupId: string
  groupName?: string
  existingSessionId?: string
}

export type ChatAgentConfig = DmAgentConfig | GroupAgentConfig

/**
 * Manages a Claude SDK agent for a single chat (DM or group).
 *
 * Each chat gets its own isolated agent with:
 * - Type-specific prompt (dm.md or group.md with common.md prefix)
 * - Persistent session for conversation continuity
 * - Independent context (no cross-chat awareness)
 */
export class ChatAgent {
  readonly chatId: string
  readonly type: 'dm' | 'group'

  private config: ChatAgentConfig
  private session: ReturnType<typeof unstable_v2_createSession> | null = null
  private _sessionId: string | null = null

  constructor(config: ChatAgentConfig) {
    this.chatId = config.chatId
    this.type = config.type
    this.config = config
  }

  /**
   * Returns the session ID after initialization.
   * Throws if called before initialize().
   */
  get sessionId(): string {
    if (!this._sessionId) {
      throw new Error('Agent not initialized. Call initialize() first.')
    }
    return this._sessionId
  }

  /**
   * Initializes the agent by creating or resuming a session.
   *
   * If existingSessionId is provided, attempts to resume that session.
   * On resume failure, logs a warning and creates a fresh session.
   *
   * Safe to call multiple times - closes existing session before creating new one.
   */
  async initialize(): Promise<void> {
    // Close existing session if re-initializing
    if (this.session) {
      this.session.close()
      this.session = null
      this._sessionId = null
    }

    const systemPrompt = this.buildSystemPrompt()

    const sessionOptions = {
      model: this.config.anthropicModel,
      systemPrompt,
    }

    if (this.config.existingSessionId) {
      try {
        this.session = unstable_v2_resumeSession(
          this.config.existingSessionId,
          sessionOptions
        )
        this._sessionId = this.session.sessionId
        return
      } catch (error) {
        console.warn(
          `[agent:${this.chatId}] Failed to resume session ${this.config.existingSessionId}, creating fresh session:`,
          error
        )
      }
    }

    this.session = unstable_v2_createSession(sessionOptions)
    this._sessionId = this.session.sessionId
  }

  /**
   * Builds the system prompt based on chat type.
   */
  private buildSystemPrompt(): string {
    if (this.config.type === 'dm') {
      const { contactName, contactPhone, agentPhoneNumber } = this.config
      return loadPrompt('dm', {
        AGENT_PHONE_NUMBER: agentPhoneNumber,
        CONTACT_NAME: contactName || contactPhone,
        CONTACT_PHONE: contactPhone,
      })
    }

    const { groupName, groupId, agentPhoneNumber } = this.config
    return loadPrompt('group', {
      AGENT_PHONE_NUMBER: agentPhoneNumber,
      GROUP_NAME: groupName || groupId,
      GROUP_ID: groupId,
    })
  }

  /**
   * Returns the underlying SDK session.
   * Throws if called before initialize().
   */
  getSession(): ReturnType<typeof unstable_v2_createSession> {
    if (!this.session) {
      throw new Error('Agent not initialized. Call initialize() first.')
    }
    return this.session
  }

  /**
   * Closes the session and releases resources.
   */
  close(): void {
    if (this.session) {
      this.session.close()
      this.session = null
      this._sessionId = null
    }
  }
}
