import { ParsedTextMessage, ParsedReactionMessage, ParsedQuote } from './receiver.js'

/**
 * Formats a Signal timestamp (Unix milliseconds) as ISO 8601.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * Options for formatting a text message.
 */
export interface TextMessageFormatOptions {
  /** Display name for the quoted message author (defaults to phone number) */
  quoteAuthorName?: string
}

/**
 * Formats a quote for display in a message.
 *
 * Format: (replying to msg@{timestamp} from {authorName}: "{preview}")
 */
function formatQuote(quote: ParsedQuote, authorName: string): string {
  let result = `(replying to msg@${quote.targetTimestamp} from ${authorName}`
  if (quote.text) {
    result += `: "${quote.text}"`
  }
  result += ')'
  return result
}

/**
 * Formats a parsed text message for the agent's context.
 *
 * Format: [{ISO8601}] {senderName} ({senderPhone}): {text}
 * If the message is a reply, includes: (replying to msg@{timestamp} from {author}: "{preview}")
 *
 * Per spec, the chat label is omitted since each agent knows its chat
 * from its system prompt.
 */
export function formatTextMessage(
  message: ParsedTextMessage,
  options: TextMessageFormatOptions = {}
): string {
  const timestamp = formatTimestamp(message.timestamp)
  // Use || to fall back to phone number for both undefined AND empty string
  const senderName = message.sourceName || message.source
  const senderPhone = message.source

  let result = `[${timestamp}] ${senderName} (${senderPhone})`

  // Add quote context if this is a reply
  if (message.quote) {
    const quoteAuthorName = options.quoteAuthorName ?? message.quote.targetAuthor
    result += ` ${formatQuote(message.quote, quoteAuthorName)}`
  }

  result += `: ${message.text}`
  return result
}

/**
 * Options for formatting a reaction message.
 */
export interface ReactionFormatOptions {
  /** Display name for the target message author (defaults to phone number) */
  targetAuthorName?: string
  /** Preview of the original message text */
  messagePreview?: string
}

/**
 * Formats a parsed reaction message for the agent's context.
 *
 * Format: [{ISO8601}] {reactorName} ({reactorPhone}) reacted {emoji} to msg@{targetTimestamp} from {authorName}: "{preview}"
 *
 * If messagePreview is not provided, the trailing `: "{preview}"` is omitted.
 */
export function formatReactionMessage(
  reaction: ParsedReactionMessage,
  options: ReactionFormatOptions = {}
): string {
  const timestamp = formatTimestamp(reaction.timestamp)
  // Use || to fall back to phone number for both undefined AND empty string
  const reactorName = reaction.sourceName || reaction.source
  const reactorPhone = reaction.source
  const authorName = options.targetAuthorName ?? reaction.targetAuthor

  let result = `[${timestamp}] ${reactorName} (${reactorPhone}) reacted ${reaction.emoji} to msg@${reaction.targetTimestamp} from ${authorName}`

  if (options.messagePreview !== undefined) {
    result += `: "${options.messagePreview}"`
  }

  return result
}
