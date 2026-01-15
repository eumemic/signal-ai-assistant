import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLogger, Logger } from './logger.js'

/** ISO 8601 timestamp pattern: 2024-01-15T10:30:45.123Z */
const ISO8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/

describe('logger', () => {
  let originalConsoleLog: typeof console.log
  let originalConsoleError: typeof console.error
  let originalConsoleWarn: typeof console.warn
  let logOutput: string[]
  let logger: Logger

  beforeEach(() => {
    logOutput = []
    logger = createLogger()
    originalConsoleLog = console.log
    originalConsoleError = console.error
    originalConsoleWarn = console.warn

    // Capture all console output
    console.log = vi.fn((...args) => {
      logOutput.push(args.map(String).join(' '))
    })
    console.error = vi.fn((...args) => {
      logOutput.push(args.map(String).join(' '))
    })
    console.warn = vi.fn((...args) => {
      logOutput.push(args.map(String).join(' '))
    })
  })

  afterEach(() => {
    console.log = originalConsoleLog
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  })

  describe('test_log_timestamp_format', () => {
    it('should prefix log messages with ISO 8601 timestamp', () => {
      logger.info('test message')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('test message')
    })

    it('should prefix error messages with ISO 8601 timestamp', () => {
      logger.error('error message')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('error message')
    })

    it('should prefix warn messages with ISO 8601 timestamp', () => {
      logger.warn('warning message')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('warning message')
    })

    it('should handle multiple arguments', () => {
      logger.info('key:', 'value', 123)

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('key:')
      expect(logOutput[0]).toContain('value')
      expect(logOutput[0]).toContain('123')
    })

    it('should use current timestamp when logging', () => {
      const beforeLog = new Date()

      logger.info('test')

      const afterLog = new Date()
      const timestampMatch = logOutput[0].match(ISO8601_PATTERN)
      expect(timestampMatch).not.toBeNull()

      const loggedTime = new Date(timestampMatch![0])
      expect(loggedTime.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime())
      expect(loggedTime.getTime()).toBeLessThanOrEqual(afterLog.getTime())
    })
  })

  describe('convenience methods', () => {
    it('info should call console.log', () => {
      logger.info('message')
      expect(console.log).toHaveBeenCalled()
    })

    it('error should call console.error', () => {
      logger.error('message')
      expect(console.error).toHaveBeenCalled()
    })

    it('warn should call console.warn', () => {
      logger.warn('message')
      expect(console.warn).toHaveBeenCalled()
    })
  })

  describe('test_log_types', () => {
    it('should format receiver logs with [receiver] prefix', () => {
      logger.receiver('Message from Tom (+1234567890)')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[receiver] Message from Tom')
    })

    it('should format mailbox logs with [mailbox:{chatId}] prefix', () => {
      logger.mailbox('+1234567890', 'Queued message, 1 pending')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[mailbox:+1234567890] Queued message')
    })

    it('should format agent logs with [agent:{chatId}] prefix', () => {
      logger.agent('Z3JvdXBfYWJj==', 'Waking up with 1 message(s)')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[agent:Z3JvdXBfYWJj==] Waking up')
    })

    it('should format thinking logs with [thinking] prefix inside agent context', () => {
      logger.thinking('Z3JvdXBfYWJj==', 'Considering whether to respond...')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[agent:Z3JvdXBfYWJj==] [thinking] Considering')
    })

    it('should format bash logs with [bash] prefix inside agent context', () => {
      logger.bash('+1234567890', 'signal-cli -a +1234567890 send -m "Hello"')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[agent:+1234567890] [bash] signal-cli')
    })

    it('should format bash_result logs with [bash_result] prefix inside agent context', () => {
      logger.bashResult('+1234567890', 'Message sent successfully')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[agent:+1234567890] [bash_result] Message sent')
    })

    it('should format pass logs with [pass] prefix', () => {
      logger.pass('Z3JvdXBfYWJj==', 'Not relevant to my expertise')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[agent:Z3JvdXBfYWJj==] [pass] Not relevant')
    })

    it('should format tool_call logs with [tool_call] prefix inside agent context', () => {
      logger.toolCall('+1234567890', 'Read', '/home/jarvis/file.txt')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[agent:+1234567890] [tool_call] Read')
    })

    it('should format tool_result logs with [tool_result] prefix inside agent context', () => {
      logger.toolResult('+1234567890', 'File contents returned')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toMatch(ISO8601_PATTERN)
      expect(logOutput[0]).toContain('[agent:+1234567890] [tool_result] File contents')
    })

    it('should handle group IDs with special characters', () => {
      logger.agent('Z3JvdXBfYWJjMTIz==', 'Processing group message')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toContain('[agent:Z3JvdXBfYWJjMTIz==]')
    })

    it('should handle phone numbers with + prefix', () => {
      logger.mailbox('+11234567890', 'Message queued')

      expect(logOutput.length).toBe(1)
      expect(logOutput[0]).toContain('[mailbox:+11234567890]')
    })
  })
})
