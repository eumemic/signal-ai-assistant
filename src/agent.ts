import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk'
import { loadPrompt } from './prompts'

/** Default turn timeout: 10 minutes in milliseconds */
const DEFAULT_TURN_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Common options required for all agents.
 */
export interface AgentOptions {
  agentPhoneNumber: string
  anthropicModel: string
}

/**
 * Options for running an agent turn.
 */
export interface TurnOptions {
  /** Custom timeout in milliseconds (default: 10 minutes) */
  timeoutMs?: number
}

/**
 * Result of running an agent turn.
 */
export interface TurnResult {
  /** Whether the turn timed out before completing */
  timedOut: boolean
  /** The agent's response (undefined if timed out) */
  response?: string
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

  /**
   * Runs an agent turn with the given message, applying a timeout.
   *
   * The turn timeout (default 10 minutes) prevents runaway agent turns from
   * blocking forever. On timeout:
   * - The timeout is logged
   * - The agent goes idle (returns to check mailbox on next message)
   * - The orchestrator is not affected (resilient design)
   *
   * @param message - The message to send to the agent
   * @param options - Optional turn configuration (e.g., custom timeout)
   * @returns TurnResult indicating success or timeout
   */
  async runTurn(message: string, options?: TurnOptions): Promise<TurnResult> {
    if (!this.session) {
      throw new Error('Agent not initialized. Call initialize() first.')
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs)
    })

    const turnPromise = this.executeTurn(message)

    const response = await Promise.race([turnPromise, timeoutPromise])

    if (response === null) {
      console.log(
        `[agent:${this.chatId}] Turn timed out after ${timeoutMs / 60000} minutes`
      )
      return { timedOut: true }
    }

    return { timedOut: false, response }
  }

  /**
   * Executes the turn by sending the message and collecting the response from the stream.
   */
  private async executeTurn(message: string): Promise<string> {
    await this.session!.send(message)

    let response = ''
    for await (const sdkMessage of this.session!.stream()) {
      if (sdkMessage.type === 'result') {
        if (sdkMessage.subtype === 'success') {
          response = sdkMessage.result
        }
        break
      }
    }

    return response
  }
}
