import { ParsedTextMessage } from './receiver'

/**
 * Formats a Signal timestamp (Unix milliseconds) as ISO 8601.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * Formats a parsed text message for the agent's context.
 *
 * Format: [{ISO8601}] {senderName} ({senderPhone}): {text}
 *
 * Per spec, the chat label is omitted since each agent knows its chat
 * from its system prompt.
 */
export function formatTextMessage(message: ParsedTextMessage): string {
  const timestamp = formatTimestamp(message.timestamp)
  const senderName = message.sourceName ?? message.source
  const senderPhone = message.source

  return `[${timestamp}] ${senderName} (${senderPhone}): ${message.text}`
}
