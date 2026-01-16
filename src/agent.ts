import { query, type Query, type SDKMessage, type HookCallback } from '@anthropic-ai/claude-agent-sdk'
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

    // Determine if this is group behavior mode (groups, or DMs with useGroupBehavior)
    const isGroupBehavior =
      this.config.type === 'group' ||
      (this.config.type === 'dm' && this.config.useGroupBehavior)

    // UserPromptSubmit hook to remind agent about sending messages in group mode
    const groupModePromptHook: HookCallback = async () => {
      return {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit' as const,
          additionalContext:
            'Remember: To respond to this message, you MUST use the Bash tool with the send script. ' +
            'Your text responses are not sent automatically. If you choose not to respond, that\'s fine.',
        },
      }
    }

    // Build query options
    const queryOptions = {
      model: this.config.anthropicModel,
      systemPrompt,
      // Bash for signal-cli and system commands, Read for viewing images/documents
      tools: ['Bash', 'Read'] as string[],
      // Bypass permission prompts - this bot runs headless
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      // Resume existing session if available
      ...(this._sessionId ? { resume: this._sessionId } : {}),
      // Add UserPromptSubmit hook for group mode reminder
      ...(isGroupBehavior
        ? { hooks: { UserPromptSubmit: [{ hooks: [groupModePromptHook] }] } }
        : {}),
    }

    console.log(`[agent:${this.chatId}] Query options: resume=${this._sessionId || 'none'}`)

    // Create the query
    this.currentQuery = query({
      prompt: message,
      options: queryOptions,
    })

    let response = ''

    // Stream through the messages - log all events for observability
    for await (const sdkMessage of this.currentQuery) {
      // Capture session ID from any message
      if ('session_id' in sdkMessage && sdkMessage.session_id) {
        this._sessionId = sdkMessage.session_id
      }

      // Log all SDK events for full observability
      this.logSdkMessage(sdkMessage)

      // Capture the final result
      if (sdkMessage.type === 'result') {
        if (sdkMessage.subtype === 'success') {
          response = sdkMessage.result
        }
        break
      }
    }

    this.currentQuery = null
    return response
  }

  /**
   * Logs an SDK message to stdout for full observability.
   * All agent stream events are logged so operators can monitor agent behavior.
   */
  private logSdkMessage(msg: SDKMessage): void {
    const prefix = `[agent:${this.chatId}]`

    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          console.log(`${prefix} [init] model=${msg.model} tools=${msg.tools.join(',')} permissionMode=${msg.permissionMode}`)
        } else if (msg.subtype === 'status') {
          console.log(`${prefix} [status] ${msg.status ?? 'idle'}`)
        } else if (msg.subtype === 'hook_response') {
          console.log(`${prefix} [hook] ${msg.hook_event}:${msg.hook_name} exit=${msg.exit_code}`)
          if (msg.stdout) console.log(`${prefix} [hook stdout] ${msg.stdout.substring(0, 500)}`)
          if (msg.stderr) console.log(`${prefix} [hook stderr] ${msg.stderr.substring(0, 500)}`)
        } else if (msg.subtype === 'compact_boundary') {
          console.log(`${prefix} [compact] trigger=${msg.compact_metadata.trigger} pre_tokens=${msg.compact_metadata.pre_tokens}`)
        }
        break

      case 'assistant':
        // Log assistant message with any tool calls
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              // Log text blocks (Claude's thinking/response)
              const text = (block as { text?: string }).text ?? ''
              if (text.trim()) {
                console.log(`${prefix} [assistant] ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`)
              }
            } else if (block.type === 'tool_use') {
              const toolBlock = block as { name?: string; input?: Record<string, unknown> }
              console.log(`${prefix} [tool_call] ${toolBlock.name}`)
              if (toolBlock.name === 'Bash') {
                const cmd = (toolBlock.input as { command?: string })?.command
                // Use JSON.stringify to show exact string including escape sequences
                console.log(`${prefix} [bash] ${cmd}`)
                console.log(`${prefix} [bash_raw] ${JSON.stringify(cmd)}`)
              }
            }
          }
        }
        if (msg.error) {
          console.error(`${prefix} [assistant_error] ${msg.error}`)
        }
        break

      case 'user':
        // Log tool results
        if ('isReplay' in msg && msg.isReplay) {
          // Skip replay messages (duplicates)
          break
        }
        if (msg.message?.content) {
          for (const block of msg.message.content as Array<{ type: string; content?: string | Array<{ type: string; text?: string }> }>) {
            if (block.type === 'tool_result') {
              const content = typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.map(c => c.text).join('\n')
                  : ''
              console.log(`${prefix} [tool_result] ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`)
            }
          }
        }
        break

      case 'result':
        // Log final result with usage stats
        if (msg.subtype === 'success') {
          const cost = msg.total_cost_usd?.toFixed(4) ?? '0.0000'
          console.log(`${prefix} [result] success turns=${msg.num_turns} cost=$${cost} duration=${msg.duration_ms}ms`)
        } else {
          console.error(`${prefix} [result] ${msg.subtype} errors=${(msg as { errors?: string[] }).errors?.join(', ')}`)
        }
        break

      case 'stream_event':
        // Log streaming events (partial responses)
        const event = msg.event
        if (event.type === 'content_block_delta') {
          const delta = (event as { delta?: { type?: string; text?: string } }).delta
          if (delta?.type === 'text_delta' && delta.text) {
            // Log text deltas (streaming text output)
            process.stdout.write(delta.text)
          }
        } else if (event.type === 'message_start') {
          console.log(`${prefix} [stream] message_start`)
        } else if (event.type === 'message_stop') {
          console.log(`\n${prefix} [stream] message_stop`)
        }
        break

      case 'tool_progress':
        console.log(`${prefix} [tool_progress] ${msg.tool_name} elapsed=${msg.elapsed_time_seconds}s`)
        break

      case 'auth_status':
        console.log(`${prefix} [auth] authenticating=${msg.isAuthenticating}${msg.error ? ` error=${msg.error}` : ''}`)
        break
    }
  }
}
