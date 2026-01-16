import { query, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadPrompt } from './prompts.js'

// Get the directory of this module for resolving script paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  /** Use group behavior (opt-in to respond) even though this is a DM */
  useGroupBehavior?: boolean
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
 *
 * Uses the V1 query() API which supports systemPrompt, allowedTools, and permissionMode.
 */
export class ChatAgent {
  readonly chatId: string
  readonly type: 'dm' | 'group'

  private config: ChatAgentConfig
  private _sessionId: string | null = null
  private currentQuery: Query | null = null

  constructor(config: ChatAgentConfig) {
    this.chatId = config.chatId
    this.type = config.type
    this.config = config
  }

  /**
   * Returns the session ID if available.
   * For new sessions, this is only available after the first message exchange.
   * For resumed sessions, this is available immediately.
   * Returns null if not yet available.
   */
  get sessionId(): string | null {
    return this._sessionId
  }

  /**
   * Initializes the agent. For V1 API, this is a no-op since queries are
   * created per-turn. Sets up the initial session ID if resuming.
   */
  async initialize(): Promise<void> {
    // If we have an existing session ID, store it for resume
    if (this.config.existingSessionId) {
      this._sessionId = this.config.existingSessionId
    }
  }

  /**
   * Builds the system prompt based on chat type.
   * If useGroupBehavior is set on a DM, uses the group prompt (for testing).
   */
  private buildSystemPrompt(): string {
    const { agentPhoneNumber } = this.config
    // Resolve the send script path relative to the project root (one level up from src/)
    const sendScriptPath = path.resolve(__dirname, '..', 'scripts', 'signal-send.sh')

    if (this.config.type === 'dm') {
      const { contactName, contactPhone, useGroupBehavior } = this.config

      if (useGroupBehavior) {
        // Use group prompt for DM (testing group behavior)
        // Send script targets the phone number directly (not a group)
        const sendScript = `${sendScriptPath} ${contactPhone}`
        console.log(`[agent:${this.chatId}] Using GROUP prompt (useGroupBehavior=true)`)
        console.log(`[agent:${this.chatId}] Send script: ${sendScript}`)
        const prompt = loadPrompt('group', {
          AGENT_PHONE_NUMBER: agentPhoneNumber,
          GROUP_NAME: `DM with ${contactName || contactPhone}`,
          SEND_SCRIPT: sendScript,
        })
        console.log(`[agent:${this.chatId}] System prompt:\n${prompt}`)
        return prompt
      }

      console.log(`[agent:${this.chatId}] Using DM prompt`)
      return loadPrompt('dm', {
        AGENT_PHONE_NUMBER: agentPhoneNumber,
        CONTACT_NAME: contactName || contactPhone,
        CONTACT_PHONE: contactPhone,
      })
    }

    const { groupName, groupId } = this.config
    // Send script targets the group with -g flag
    const sendScript = `${sendScriptPath} -g "${groupId}"`
    console.log(`[agent:${this.chatId}] Using GROUP prompt`)
    return loadPrompt('group', {
      AGENT_PHONE_NUMBER: agentPhoneNumber,
      GROUP_NAME: groupName || groupId,
      SEND_SCRIPT: sendScript,
    })
  }

  /**
   * Closes the agent and releases resources.
   */
  close(): void {
    this._sessionId = null
    this.currentQuery = null
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
   * Executes the turn using the V1 query() API.
   * This API supports systemPrompt, allowedTools, and permissionMode.
   */
  private async executeTurn(message: string): Promise<string> {
    const systemPrompt = this.buildSystemPrompt()

    // Build query options
    const queryOptions = {
      model: this.config.anthropicModel,
      systemPrompt,
      // Only allow Bash tool for running signal-cli commands
      tools: ['Bash'] as string[],
      // Bypass permission prompts - this bot runs headless
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      // Resume existing session if available
      ...(this._sessionId ? { resume: this._sessionId } : {}),
    }

    // Create the query
    this.currentQuery = query({
      prompt: message,
      options: queryOptions,
    })

    let response = ''

    // Stream through the messages
    for await (const sdkMessage of this.currentQuery) {
      // Capture session ID from any message
      if ('session_id' in sdkMessage && sdkMessage.session_id) {
        this._sessionId = sdkMessage.session_id
      }

      // Log tool use for debugging
      if (sdkMessage.type === 'assistant' && sdkMessage.message?.content) {
        for (const block of sdkMessage.message.content) {
          if (block.type === 'tool_use') {
            console.log(`[agent:${this.chatId}] Tool call: ${block.name}`)
            if (block.name === 'Bash') {
              console.log(`[agent:${this.chatId}] Bash command: ${(block.input as { command?: string })?.command}`)
            }
          }
        }
      }

      // Log tool results (shows Bash output)
      if (sdkMessage.type === 'user' && sdkMessage.message?.content) {
        for (const block of sdkMessage.message.content) {
          if (block.type === 'tool_result') {
            const result = block as { tool_use_id?: string; content?: string | Array<{ type: string; text?: string }> }
            const content = typeof result.content === 'string'
              ? result.content
              : result.content?.map(c => c.text).join('\n')
            console.log(`[agent:${this.chatId}] Tool result: ${content?.substring(0, 500)}`)
          }
        }
      }

      // Capture the final result
      if (sdkMessage.type === 'result') {
        if (sdkMessage.subtype === 'success') {
          response = sdkMessage.result
        } else {
          console.error(`[agent:${this.chatId}] Query ended with error:`, sdkMessage.subtype)
        }
        break
      }
    }

    this.currentQuery = null
    return response
  }
}
