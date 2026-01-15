/**
 * Structured logger that prefixes all log lines with ISO 8601 timestamps.
 *
 * Per spec (1-agent-foundation.md § Observability), all log output includes
 * ISO 8601 timestamps for correlation and debugging.
 *
 * Log types with chat ID correlation:
 * - [receiver] - Message received from signal-cli
 * - [mailbox:{chatId}] - Message queued to mailbox
 * - [agent:{chatId}] - Agent activity for specific chat
 * - [thinking] - Agent reasoning
 * - [bash] / [tool_call] - Tool invocations
 * - [bash_result] / [tool_result] - Tool outputs
 * - [pass] - Agent explicitly chose not to respond
 */
export interface Logger {
  /** Log an informational message */
  info(...args: unknown[]): void
  /** Log an error message */
  error(...args: unknown[]): void
  /** Log a warning message */
  warn(...args: unknown[]): void

  /** Log receiver events: [receiver] prefix */
  receiver(message: string, ...args: unknown[]): void
  /** Log mailbox events: [mailbox:{chatId}] prefix */
  mailbox(chatId: string, message: string, ...args: unknown[]): void
  /** Log agent events: [agent:{chatId}] prefix */
  agent(chatId: string, message: string, ...args: unknown[]): void
  /** Log agent thinking: [agent:{chatId}] [thinking] prefix */
  thinking(chatId: string, message: string, ...args: unknown[]): void
  /** Log bash commands: [agent:{chatId}] [bash] prefix */
  bash(chatId: string, command: string, ...args: unknown[]): void
  /** Log bash results: [agent:{chatId}] [bash_result] prefix */
  bashResult(chatId: string, result: string, ...args: unknown[]): void
  /** Log pass tool usage: [agent:{chatId}] [pass] prefix */
  pass(chatId: string, reason: string, ...args: unknown[]): void
  /** Log tool calls: [agent:{chatId}] [tool_call] prefix */
  toolCall(chatId: string, toolName: string, ...args: unknown[]): void
  /** Log tool results: [agent:{chatId}] [tool_result] prefix */
  toolResult(chatId: string, result: string, ...args: unknown[]): void
}

/**
 * Returns the current timestamp in ISO 8601 format.
 */
function getTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Logs a message with agent context and an optional action tag.
 */
function logAgentAction(chatId: string, tag: string, message: string, ...args: unknown[]): void {
  console.log(getTimestamp(), `[agent:${chatId}]`, `[${tag}]`, message, ...args)
}

/**
 * Creates a structured logger that prefixes all output with ISO 8601 timestamps.
 *
 * Example output:
 * ```
 * 2024-01-15T10:30:45.123Z [receiver] Message from Tom
 * 2024-01-15T10:30:45.456Z [agent:+123] Processing...
 * ```
 */
export function createLogger(): Logger {
  return {
    info(...args: unknown[]): void {
      console.log(getTimestamp(), ...args)
    },

    error(...args: unknown[]): void {
      console.error(getTimestamp(), ...args)
    },

    warn(...args: unknown[]): void {
      console.warn(getTimestamp(), ...args)
    },

    receiver(message: string, ...args: unknown[]): void {
      console.log(getTimestamp(), '[receiver]', message, ...args)
    },

    mailbox(chatId: string, message: string, ...args: unknown[]): void {
      console.log(getTimestamp(), `[mailbox:${chatId}]`, message, ...args)
    },

    agent(chatId: string, message: string, ...args: unknown[]): void {
      console.log(getTimestamp(), `[agent:${chatId}]`, message, ...args)
    },

    thinking(chatId: string, message: string, ...args: unknown[]): void {
      logAgentAction(chatId, 'thinking', message, ...args)
    },

    bash(chatId: string, command: string, ...args: unknown[]): void {
      logAgentAction(chatId, 'bash', command, ...args)
    },

    bashResult(chatId: string, result: string, ...args: unknown[]): void {
      logAgentAction(chatId, 'bash_result', result, ...args)
    },

    pass(chatId: string, reason: string, ...args: unknown[]): void {
      logAgentAction(chatId, 'pass', reason, ...args)
    },

    toolCall(chatId: string, toolName: string, ...args: unknown[]): void {
      logAgentAction(chatId, 'tool_call', toolName, ...args)
    },

    toolResult(chatId: string, result: string, ...args: unknown[]): void {
      logAgentAction(chatId, 'tool_result', result, ...args)
    },
  }
}

/**
 * Global logger instance for use throughout the application.
 */
export const logger = createLogger()
