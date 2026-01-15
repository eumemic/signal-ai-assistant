/**
 * Structured logger that prefixes all log lines with ISO 8601 timestamps.
 *
 * Per spec (1-agent-foundation.md § Observability), all log output includes
 * ISO 8601 timestamps for correlation and debugging.
 */
export interface Logger {
  /** Log an informational message */
  info(...args: unknown[]): void
  /** Log an error message */
  error(...args: unknown[]): void
  /** Log a warning message */
  warn(...args: unknown[]): void
}

/**
 * Returns the current timestamp in ISO 8601 format.
 */
function getTimestamp(): string {
  return new Date().toISOString()
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
  }
}

/**
 * Global logger instance for use throughout the application.
 */
export const logger = createLogger()
