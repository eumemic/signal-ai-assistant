import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLogger, Logger } from './logger'

describe('logger', () => {
  let originalConsoleLog: typeof console.log
  let originalConsoleError: typeof console.error
  let originalConsoleWarn: typeof console.warn
  let logOutput: string[]

  beforeEach(() => {
    logOutput = []
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
      const logger = createLogger()

      logger.info('test message')

      expect(logOutput.length).toBe(1)
      // ISO 8601 format: 2024-01-15T10:30:45.123Z
      const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /
      expect(logOutput[0]).toMatch(iso8601Pattern)
      expect(logOutput[0]).toContain('test message')
    })

    it('should prefix error messages with ISO 8601 timestamp', () => {
      const logger = createLogger()

      logger.error('error message')

      expect(logOutput.length).toBe(1)
      const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /
      expect(logOutput[0]).toMatch(iso8601Pattern)
      expect(logOutput[0]).toContain('error message')
    })

    it('should prefix warn messages with ISO 8601 timestamp', () => {
      const logger = createLogger()

      logger.warn('warning message')

      expect(logOutput.length).toBe(1)
      const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /
      expect(logOutput[0]).toMatch(iso8601Pattern)
      expect(logOutput[0]).toContain('warning message')
    })

    it('should handle multiple arguments', () => {
      const logger = createLogger()

      logger.info('key:', 'value', 123)

      expect(logOutput.length).toBe(1)
      const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /
      expect(logOutput[0]).toMatch(iso8601Pattern)
      expect(logOutput[0]).toContain('key:')
      expect(logOutput[0]).toContain('value')
      expect(logOutput[0]).toContain('123')
    })

    it('should use current timestamp when logging', () => {
      const logger = createLogger()
      const beforeLog = new Date()

      logger.info('test')

      const afterLog = new Date()
      // Extract timestamp from log output
      const timestampMatch = logOutput[0].match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)
      expect(timestampMatch).not.toBeNull()

      const loggedTime = new Date(timestampMatch![1])
      expect(loggedTime.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime())
      expect(loggedTime.getTime()).toBeLessThanOrEqual(afterLog.getTime())
    })
  })

  describe('convenience methods', () => {
    it('info should call console.log', () => {
      const logger = createLogger()
      logger.info('message')
      expect(console.log).toHaveBeenCalled()
    })

    it('error should call console.error', () => {
      const logger = createLogger()
      logger.error('message')
      expect(console.error).toHaveBeenCalled()
    })

    it('warn should call console.warn', () => {
      const logger = createLogger()
      logger.warn('message')
      expect(console.warn).toHaveBeenCalled()
    })
  })
})
