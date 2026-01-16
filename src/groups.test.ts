import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFile } from 'child_process'
import { GroupCache, createGroupCache } from './groups'

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

describe('GroupCache (test_group_name_resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initial load via signal-cli listGroups -d', () => {
    it('parses group list output and builds ID→name cache', async () => {
      const mockOutput = JSON.stringify([
        {
          id: 'Z3JvdXBfYWJjMTIz==',
          name: 'Family Chat',
          isMember: true,
        },
        {
          id: 'YW5vdGhlcmdyb3Vw==',
          name: 'Work Team',
          isMember: true,
        },
      ])

      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(null, mockOutput, '')
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      expect(cache.getName('Z3JvdXBfYWJjMTIz==')).toBe('Family Chat')
      expect(cache.getName('YW5vdGhlcmdyb3Vw==')).toBe('Work Team')
    })

    it('calls signal-cli with correct arguments', async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(null, '[]', '')
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      expect(execFile).toHaveBeenCalledWith(
        'signal-cli',
        ['-a', '+1555123456', '-o', 'json', 'listGroups', '-d'],
        { encoding: 'utf8' },
        expect.any(Function)
      )
    })

    it('returns undefined for unknown group IDs', async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(null, '[]', '')
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      expect(cache.getName('unknown-id')).toBeUndefined()
    })

    it('handles empty group list', async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(null, '[]', '')
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      // Should not throw, just have empty cache
      expect(cache.getName('any-id')).toBeUndefined()
    })
  })

  describe('refresh on unknown group ID', () => {
    it('refreshes cache when unknown group ID is requested', async () => {
      let callCount = 0
      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          callCount++
          const output =
            callCount === 1
              ? JSON.stringify([{ id: 'existing-group', name: 'Original Group', isMember: true }])
              : JSON.stringify([
                  { id: 'existing-group', name: 'Original Group', isMember: true },
                  { id: 'new-group', name: 'New Group', isMember: true },
                ])

          if (callback) {
            callback(null, output, '')
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      // Initially, new-group is not in cache
      expect(cache.getName('new-group')).toBeUndefined()

      // Request refresh and get the new group
      const name = await cache.getNameWithRefresh('new-group')
      expect(name).toBe('New Group')

      // Verify refresh was called
      expect(execFile).toHaveBeenCalledTimes(2)
    })

    it('returns cached value without refresh if group is known', async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(
              null,
              JSON.stringify([{ id: 'known-group', name: 'Known Group', isMember: true }]),
              ''
            )
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      const name = await cache.getNameWithRefresh('known-group')
      expect(name).toBe('Known Group')

      // Should only have called once (initial load)
      expect(execFile).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('logs error and continues with empty cache when signal-cli fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(new Error('signal-cli not found'), '', '')
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      // Should not throw, just log and continue
      expect(consoleSpy).toHaveBeenCalled()
      expect(cache.getName('any-id')).toBeUndefined()

      consoleSpy.mockRestore()
    })

    it('handles malformed JSON output gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(null, 'not valid json', '')
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      // Should log error and continue
      expect(consoleSpy).toHaveBeenCalled()
      expect(cache.getName('any-id')).toBeUndefined()

      consoleSpy.mockRestore()
    })

    it('handles groups with missing name field', async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(
              null,
              JSON.stringify([
                { id: 'group-with-name', name: 'Has Name', isMember: true },
                { id: 'group-without-name', isMember: true }, // Missing name field
              ]),
              ''
            )
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      expect(cache.getName('group-with-name')).toBe('Has Name')
      // Group without name should not be cached (or cached as undefined)
      expect(cache.getName('group-without-name')).toBeUndefined()
    })
  })

  describe('cache interface', () => {
    it('provides hasGroup() to check if group is in cache', async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _file: string,
          _args: readonly string[] | null | undefined,
          _options: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) {
            callback(
              null,
              JSON.stringify([{ id: 'known-group', name: 'Known', isMember: true }]),
              ''
            )
          }
          return {} as ReturnType<typeof execFile>
        }
      )

      const cache = createGroupCache('+1555123456')
      await cache.load()

      expect(cache.hasGroup('known-group')).toBe(true)
      expect(cache.hasGroup('unknown-group')).toBe(false)
    })
  })
})
