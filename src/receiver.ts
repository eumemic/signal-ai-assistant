import { spawn } from 'child_process'

/**
 * Attachment metadata from signal-cli JSON output.
 */
export interface SignalAttachment {
  contentType: string
  filename?: string
  id: string
  /** Absolute path to the downloaded attachment file (provided by signal-cli) */
  file?: string
}

/**
 * Reaction data from signal-cli JSON output.
 * Note: signal-cli uses targetSentTimestamp, not targetTimestamp.
 */
export interface SignalReaction {
  emoji: string
  targetAuthor: string
  /** The timestamp of the message being reacted to (signal-cli calls this targetSentTimestamp) */
  targetSentTimestamp: number
}

/**
 * Group info from signal-cli JSON output.
 */
export interface SignalGroupInfo {
  groupId: string
  groupName?: string
  type?: string
}

/**
 * Quote (reply-to) data from signal-cli JSON output.
 */
export interface SignalQuote {
  /** Timestamp of the quoted message */
  id: number
  /** Phone number or UUID of the quoted message author */
  author: string
  /** Preview text of the quoted message */
  text?: string
}

/**
 * Mention data from signal-cli JSON output.
 * Signal encodes @mentions as a Unicode replacement character (U+FFFC) in the message text,
 * with this array providing the actual mention data.
 */
export interface SignalMention {
  /** Display name or UUID of the mentioned user */
  name: string
  /** Phone number if available */
  number: string | null
  /** UUID of the mentioned user */
  uuid: string
  /** Character position in the message text where the placeholder appears */
  start: number
  /** Length of the placeholder (always 1 for the U+FFFC character) */
  length: number
}

/**
 * Data message content from signal-cli.
 */
export interface SignalDataMessage {
  message?: string
  groupInfo?: SignalGroupInfo
  attachments?: SignalAttachment[]
  reaction?: SignalReaction
  quote?: SignalQuote
  mentions?: SignalMention[]
}

/**
 * The envelope structure from signal-cli --json output.
 */
export interface SignalEnvelope {
  source: string
  sourceNumber?: string
  sourceName?: string
  timestamp: number
  dataMessage?: SignalDataMessage
  receiptMessage?: { type: string }
  typingMessage?: { action: string }
}

/**
 * Base parsed message with common fields.
 */
interface ParsedMessageBase {
  chatId: string
  chatType: 'dm' | 'group'
  source: string
  sourceName?: string
  timestamp: number
  groupId?: string
  groupName?: string
}

/**
 * Quote context for a reply message.
 */
export interface ParsedQuote {
  /** Timestamp of the quoted message */
  targetTimestamp: number
  /** Phone number or UUID of the quoted message author */
  targetAuthor: string
  /** Preview text of the quoted message */
  text?: string
}

/**
 * Parsed text message.
 */
export interface ParsedTextMessage extends ParsedMessageBase {
  type: 'text'
  text: string
  attachments?: SignalAttachment[]
  /** Quote context if this is a reply to another message */
  quote?: ParsedQuote
}

/**
 * Parsed reaction message.
 */
export interface ParsedReactionMessage extends ParsedMessageBase {
  type: 'reaction'
  emoji: string
  targetAuthor: string
  targetTimestamp: number
}

export type ParsedMessage = ParsedTextMessage | ParsedReactionMessage

/**
 * Unicode Object Replacement Character used by Signal to represent @-mentions in text.
 */
const MENTION_PLACEHOLDER = '\uFFFC'

/**
 * Substitutes mention placeholder characters (U+FFFC) with readable @Name format.
 * Mentions must be processed in reverse order of position to preserve indices.
 */
function substituteMentions(text: string, mentions: SignalMention[]): string {
  if (!mentions || mentions.length === 0) {
    return text
  }

  // Sort mentions by start position descending (process from end to preserve indices)
  const sortedMentions = [...mentions].sort((a, b) => b.start - a.start)

  let result = text
  for (const mention of sortedMentions) {
    // Verify the placeholder is at the expected position
    if (result.charAt(mention.start) === MENTION_PLACEHOLDER) {
      // Use the display name, falling back to phone number or UUID
      const displayName = mention.name || mention.number || mention.uuid
      const mentionText = `@${displayName}`
      result = result.slice(0, mention.start) + mentionText + result.slice(mention.start + mention.length)
    }
  }

  return result
}

/**
 * Parses a signal-cli envelope into a structured message.
 * Returns null for message types we don't handle (receipts, typing indicators, etc).
 */
export function parseSignalMessage(envelope: SignalEnvelope): ParsedMessage | null {
  // Filter out receipt messages
  if (envelope.receiptMessage) {
    return null
  }

  // Filter out typing indicators
  if (envelope.typingMessage) {
    return null
  }

  // Must have dataMessage to continue
  const dataMessage = envelope.dataMessage
  if (!dataMessage) {
    return null
  }

  // Determine chat ID and type (using groupId variable eliminates non-null assertions)
  const groupId = dataMessage.groupInfo?.groupId
  const groupName = dataMessage.groupInfo?.groupName
  const isGroup = !!groupId
  const chatId = isGroup ? groupId : envelope.source
  const chatType: 'dm' | 'group' = isGroup ? 'group' : 'dm'

  // Common base fields for all message types
  const base = {
    chatId,
    chatType,
    source: envelope.source,
    sourceName: envelope.sourceName,
    timestamp: envelope.timestamp,
    ...(isGroup && { groupId, groupName }),
  }

  // Handle reactions
  if (dataMessage.reaction) {
    const { emoji, targetAuthor, targetSentTimestamp } = dataMessage.reaction
    return {
      ...base,
      type: 'reaction' as const,
      emoji,
      targetAuthor,
      targetTimestamp: targetSentTimestamp,
    }
  }

  // Handle text messages (with or without attachments)
  const hasText = dataMessage.message !== undefined
  const hasAttachments = dataMessage.attachments && dataMessage.attachments.length > 0

  if (hasText || hasAttachments) {
    // Build quote context if this is a reply
    const quote = dataMessage.quote
      ? {
          targetTimestamp: dataMessage.quote.id,
          targetAuthor: dataMessage.quote.author,
          ...(dataMessage.quote.text && { text: dataMessage.quote.text }),
        }
      : undefined

    // Substitute mention placeholders with @Name format
    const rawText = dataMessage.message ?? ''
    const text = dataMessage.mentions
      ? substituteMentions(rawText, dataMessage.mentions)
      : rawText

    return {
      ...base,
      type: 'text' as const,
      text,
      ...(hasAttachments && { attachments: dataMessage.attachments }),
      ...(quote && { quote }),
    }
  }

  // Empty dataMessage or unhandled type
  return null
}

/**
 * Options for creating a receiver.
 */
export interface ReceiverOptions {
  /** The agent's phone number in E.164 format */
  agentPhoneNumber: string
  /** Optional path to signal-cli config directory */
  signalCliConfig?: string
  /** Called when a valid message is received */
  onMessage: (message: ParsedMessage) => void
  /** Called when the receiver process closes */
  onClose?: (code: number | null) => void
  /** Called when an error occurs (JSON parse errors, process errors) */
  onError?: (error: Error) => void
}

/**
 * Handle returned by createReceiver for controlling the receiver.
 */
export interface ReceiverHandle {
  /** Stops the receiver subprocess */
  stop: () => void
}

/**
 * Creates a receiver that spawns signal-cli receive and parses incoming messages.
 *
 * The receiver runs `signal-cli -a {phone} receive -t -1 --json` which:
 * - Blocks indefinitely waiting for messages (-t -1)
 * - Outputs one JSON object per line (--json)
 *
 * Messages are parsed and filtered:
 * - Text messages and reactions are forwarded to onMessage
 * - Receipts and typing indicators are filtered out
 * - Malformed JSON lines are logged and skipped
 */
export function createReceiver(options: ReceiverOptions): ReceiverHandle {
  const { agentPhoneNumber, signalCliConfig, onMessage, onClose, onError } = options

  // Build args: config path (optional), account, output format, then subcommand
  const args: string[] = []
  if (signalCliConfig) {
    args.push('-c', signalCliConfig)
  }
  args.push('-a', agentPhoneNumber, '-o', 'json', 'receive', '-t', '-1')

  // Use full path to signal-cli (not in PATH to discourage agent from using it directly)
  const signalCliBin = '/opt/signal-cli-0.13.22/bin/signal-cli'
  const proc = spawn(signalCliBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  let buffer = ''

  proc.stdout.on('data', (data: Buffer) => {
    buffer += data.toString()

    // Process complete lines
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, newlineIndex)
      buffer = buffer.substring(newlineIndex + 1)

      if (line.trim() === '') {
        continue
      }

      try {
        const json = JSON.parse(line)
        if (json.envelope) {
          // Filter out self-messages (messages from the agent itself)
          if (json.envelope.source === agentPhoneNumber) {
            continue
          }
          const parsed = parseSignalMessage(json.envelope)
          if (parsed) {
            onMessage(parsed)
          }
        }
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const errorText = data.toString().trim()
    if (errorText) {
      onError?.(new Error(`signal-cli stderr: ${errorText}`))
    }
  })

  proc.on('close', (code: number | null) => {
    onClose?.(code)
  })

  proc.on('error', (error: Error) => {
    onError?.(error)
  })

  return {
    stop: () => {
      proc.kill()
    },
  }
}

/**
 * Backoff configuration for resilient receiver.
 */
interface BackoffConfig {
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs: number
  /** Maximum delay in milliseconds (default: 60000) */
  maxDelayMs: number
  /** Multiplier for each retry (default: 2) */
  multiplier: number
}

const DEFAULT_BACKOFF: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
}

/**
 * Options for creating a resilient receiver.
 * Extends ReceiverOptions with optional backoff configuration.
 */
export interface ResilientReceiverOptions extends ReceiverOptions {
  /** Optional backoff configuration */
  backoff?: Partial<BackoffConfig>
}

/**
 * Creates a resilient receiver that automatically restarts with exponential backoff on failures.
 *
 * The receiver restarts when:
 * - The process exits (any exit code, since -t -1 should run indefinitely)
 * - A spawn error occurs
 *
 * Backoff sequence: 1s → 2s → 4s → 8s → 16s → 32s → 60s (cap)
 * Backoff resets to 1s after a successful message is received.
 */
export function createResilientReceiver(options: ResilientReceiverOptions): ReceiverHandle {
  const { backoff: backoffOverride, onMessage, onClose, onError, ...baseOptions } = options

  const backoff: BackoffConfig = {
    ...DEFAULT_BACKOFF,
    ...backoffOverride,
  }

  let currentDelayMs = backoff.initialDelayMs
  let stopped = false
  let currentHandle: ReceiverHandle | null = null
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleRestart(): void {
    if (stopped) return

    const delay = currentDelayMs
    currentDelayMs = Math.min(currentDelayMs * backoff.multiplier, backoff.maxDelayMs)

    restartTimer = setTimeout(() => {
      if (!stopped) {
        startReceiver()
      }
    }, delay)
  }

  function startReceiver(): void {
    currentHandle = createReceiver({
      ...baseOptions,
      onMessage: (message) => {
        currentDelayMs = backoff.initialDelayMs
        onMessage(message)
      },
      onClose: (code) => {
        onClose?.(code)
        // Restart on process exit (any exit code, since -t -1 should run indefinitely)
        scheduleRestart()
      },
      onError: (error) => {
        onError?.(error)
        // Don't restart on error alone - wait for onClose
        // JSON parse errors (non-fatal) call onError but not onClose
        // Spawn errors call both onError and onClose, so onClose handles restart
      },
    })
  }

  startReceiver()

  return {
    stop: () => {
      stopped = true
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = null
      }
      currentHandle?.stop()
    },
  }
}
