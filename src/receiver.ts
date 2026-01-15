import { spawn } from 'child_process'

/**
 * Attachment metadata from signal-cli JSON output.
 */
export interface SignalAttachment {
  contentType: string
  filename?: string
  id: string
}

/**
 * Reaction data from signal-cli JSON output.
 */
export interface SignalReaction {
  emoji: string
  targetAuthor: string
  targetTimestamp: number
}

/**
 * Group info from signal-cli JSON output.
 */
export interface SignalGroupInfo {
  groupId: string
  type?: string
}

/**
 * Data message content from signal-cli.
 */
export interface SignalDataMessage {
  message?: string
  groupInfo?: SignalGroupInfo
  attachments?: SignalAttachment[]
  reaction?: SignalReaction
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
}

/**
 * Parsed text message.
 */
export interface ParsedTextMessage extends ParsedMessageBase {
  type: 'text'
  text: string
  attachments?: SignalAttachment[]
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
    ...(isGroup && { groupId }),
  }

  // Handle reactions
  if (dataMessage.reaction) {
    const { emoji, targetAuthor, targetTimestamp } = dataMessage.reaction
    return {
      ...base,
      type: 'reaction' as const,
      emoji,
      targetAuthor,
      targetTimestamp,
    }
  }

  // Handle text messages (with or without attachments)
  const hasText = dataMessage.message !== undefined
  const hasAttachments = dataMessage.attachments && dataMessage.attachments.length > 0

  if (hasText || hasAttachments) {
    return {
      ...base,
      type: 'text' as const,
      text: dataMessage.message ?? '',
      ...(hasAttachments && { attachments: dataMessage.attachments }),
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
  const { agentPhoneNumber, onMessage, onClose, onError } = options

  const proc = spawn(
    'signal-cli',
    ['-a', agentPhoneNumber, 'receive', '-t', '-1', '--json'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

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
