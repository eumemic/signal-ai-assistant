import { describe, it, expect, beforeEach } from 'vitest'
import { createToolValidator } from './tool-validation'
import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk'

describe('tool-validation', () => {
  let validator: CanUseTool
  let mockOptions: { signal: AbortSignal; toolUseID: string }

  beforeEach(() => {
    validator = createToolValidator()
    mockOptions = {
      signal: new AbortController().signal,
      toolUseID: 'test-id',
    }
  })

  describe('signal-cli receive blocking', () => {
    it('blocks signal-cli receive command', async () => {
      const result = await validator(
        'Bash',
        { command: 'signal-cli receive --json' },
        mockOptions
      )

      expect(result.behavior).toBe('deny')
      expect(result).toHaveProperty('message')
      expect((result as any).message).toContain('signal-cli receive')
      expect((result as any).message).toContain('managed by the system')
    })

    it('blocks signal-cli receive with account flag', async () => {
      const result = await validator(
        'Bash',
        { command: 'signal-cli -a +1234567890 receive -t -1 --json' },
        mockOptions
      )

      expect(result.behavior).toBe('deny')
    })

    it('blocks signal-cli receive in complex command', async () => {
      const result = await validator(
        'Bash',
        { command: 'cd /tmp && signal-cli receive | jq .' },
        mockOptions
      )

      expect(result.behavior).toBe('deny')
    })

    it('allows other signal-cli commands', async () => {
      const sendResult = await validator(
        'Bash',
        { command: 'signal-cli -a +1234567890 send -m "hello" +0987654321' },
        mockOptions
      )
      expect(sendResult.behavior).toBe('allow')

      const listResult = await validator(
        'Bash',
        { command: 'signal-cli listGroups -d -o json' },
        mockOptions
      )
      expect(listResult.behavior).toBe('allow')

      const reactionResult = await validator(
        'Bash',
        { command: 'signal-cli sendReaction -e "👍" -a +111 -t 123 +222' },
        mockOptions
      )
      expect(reactionResult.behavior).toBe('allow')
    })

  })

  describe('allowed commands', () => {
    it('allows non-signal-cli bash commands', async () => {
      const result = await validator(
        'Bash',
        { command: 'ls -la /tmp' },
        mockOptions
      )

      expect(result.behavior).toBe('allow')
    })

    it('allows non-Bash tools', async () => {
      const result = await validator(
        'Read',
        { file_path: '/some/file.txt' },
        mockOptions
      )

      expect(result.behavior).toBe('allow')
    })

  })

  describe('edge cases', () => {
    it('handles missing command field gracefully', async () => {
      const result = await validator('Bash', {}, mockOptions)

      expect(result.behavior).toBe('allow')
    })

    it('handles non-string command field gracefully', async () => {
      const result = await validator('Bash', { command: 123 }, mockOptions)

      expect(result.behavior).toBe('allow')
    })
  })
})
