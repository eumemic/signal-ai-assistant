import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { SessionStore, ChatSession, SESSIONS_FILE_PATH } from './sessions'

// Mock the file system
vi.mock('fs')

describe('SessionStore', () => {
  const mockFs = vi.mocked(fs)

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('test_session_persistence', () => {
    it('should save sessions to sessions.json', () => {
      // Setup: file doesn't exist initially
      mockFs.existsSync.mockReturnValue(false)
      mockFs.mkdirSync.mockReturnValue(undefined)
      mockFs.writeFileSync.mockReturnValue(undefined)

      const store = new SessionStore()

      // Save a DM session
      store.saveSession('+1234567890', {
        type: 'dm',
        sessionId: 'session_abc123',
        lastActive: '2024-01-15T10:30:45Z',
      })

      // Verify writeFileSync was called with correct data
      expect(mockFs.writeFileSync).toHaveBeenCalled()
      const [filePath, content] = mockFs.writeFileSync.mock.calls[0] as [string, string]
      expect(filePath).toBe(SESSIONS_FILE_PATH)

      const parsed = JSON.parse(content)
      expect(parsed.chats['+1234567890']).toEqual({
        type: 'dm',
        sessionId: 'session_abc123',
        lastActive: '2024-01-15T10:30:45Z',
      })
    })

    it('should load existing sessions on startup', () => {
      const existingData = {
        chats: {
          '+1234567890': {
            type: 'dm',
            sessionId: 'session_abc123',
            lastActive: '2024-01-15T10:30:45Z',
          },
          'Z3JvdXBfYWJjMTIz==': {
            type: 'group',
            sessionId: 'session_def456',
            lastActive: '2024-01-15T11:00:00Z',
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingData))

      const store = new SessionStore()

      expect(store.getSession('+1234567890')).toEqual({
        type: 'dm',
        sessionId: 'session_abc123',
        lastActive: '2024-01-15T10:30:45Z',
      })
      expect(store.getSession('Z3JvdXBfYWJjMTIz==')).toEqual({
        type: 'group',
        sessionId: 'session_def456',
        lastActive: '2024-01-15T11:00:00Z',
      })
    })

    it('should return undefined for unknown chat IDs', () => {
      mockFs.existsSync.mockReturnValue(false)

      const store = new SessionStore()
      expect(store.getSession('+9999999999')).toBeUndefined()
    })

    it('should update lastActive when saving a session', () => {
      mockFs.existsSync.mockReturnValue(false)
      mockFs.mkdirSync.mockReturnValue(undefined)
      mockFs.writeFileSync.mockReturnValue(undefined)

      const store = new SessionStore()

      const timestamp1 = '2024-01-15T10:00:00Z'
      store.saveSession('+1234567890', {
        type: 'dm',
        sessionId: 'session_abc',
        lastActive: timestamp1,
      })

      const timestamp2 = '2024-01-15T11:00:00Z'
      store.saveSession('+1234567890', {
        type: 'dm',
        sessionId: 'session_abc',
        lastActive: timestamp2,
      })

      // The latest call should have the updated timestamp
      const lastCall = mockFs.writeFileSync.mock.calls[mockFs.writeFileSync.mock.calls.length - 1] as [string, string]
      const parsed = JSON.parse(lastCall[1])
      expect(parsed.chats['+1234567890'].lastActive).toBe(timestamp2)
    })

    it('should handle group sessions', () => {
      mockFs.existsSync.mockReturnValue(false)
      mockFs.mkdirSync.mockReturnValue(undefined)
      mockFs.writeFileSync.mockReturnValue(undefined)

      const store = new SessionStore()

      store.saveSession('Z3JvdXBfYWJjMTIz==', {
        type: 'group',
        sessionId: 'session_group123',
        lastActive: '2024-01-15T12:00:00Z',
      })

      const lastCall = mockFs.writeFileSync.mock.calls[0] as [string, string]
      const parsed = JSON.parse(lastCall[1])
      expect(parsed.chats['Z3JvdXBfYWJjMTIz==']).toEqual({
        type: 'group',
        sessionId: 'session_group123',
        lastActive: '2024-01-15T12:00:00Z',
      })
    })

    it('should list all chat IDs', () => {
      const existingData = {
        chats: {
          '+1234567890': {
            type: 'dm',
            sessionId: 'session_1',
            lastActive: '2024-01-15T10:00:00Z',
          },
          '+0987654321': {
            type: 'dm',
            sessionId: 'session_2',
            lastActive: '2024-01-15T11:00:00Z',
          },
          'groupId123': {
            type: 'group',
            sessionId: 'session_3',
            lastActive: '2024-01-15T12:00:00Z',
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingData))

      const store = new SessionStore()
      const chatIds = store.listChatIds()

      expect(chatIds).toHaveLength(3)
      expect(chatIds).toContain('+1234567890')
      expect(chatIds).toContain('+0987654321')
      expect(chatIds).toContain('groupId123')
    })

    it('should create data directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)
      mockFs.mkdirSync.mockReturnValue(undefined)
      mockFs.writeFileSync.mockReturnValue(undefined)

      const store = new SessionStore()
      store.saveSession('+1234567890', {
        type: 'dm',
        sessionId: 'session_abc',
        lastActive: '2024-01-15T10:00:00Z',
      })

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(SESSIONS_FILE_PATH),
        { recursive: true }
      )
    })
  })

  describe('test_corrupted_sessions_file', () => {
    it('should handle corrupted sessions.json gracefully', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('invalid json {{{')

      // Should not throw, should log error and start with empty sessions
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = new SessionStore()

      expect(consoleSpy).toHaveBeenCalled()
      expect(store.getSession('+1234567890')).toBeUndefined()
      expect(store.listChatIds()).toHaveLength(0)

      consoleSpy.mockRestore()
    })

    it('should handle missing chats property in sessions.json', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('{}')

      const store = new SessionStore()
      expect(store.listChatIds()).toHaveLength(0)
    })
  })

  describe('test_session_resume_failure', () => {
    it('should remove session on resume failure', () => {
      const existingData = {
        chats: {
          '+1234567890': {
            type: 'dm',
            sessionId: 'session_abc123',
            lastActive: '2024-01-15T10:30:45Z',
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingData))
      mockFs.mkdirSync.mockReturnValue(undefined)
      mockFs.writeFileSync.mockReturnValue(undefined)

      const store = new SessionStore()

      // Verify session exists
      expect(store.getSession('+1234567890')).toBeDefined()

      // Mark session as failed (will be removed)
      store.removeSession('+1234567890')

      // Session should be gone
      expect(store.getSession('+1234567890')).toBeUndefined()

      // Should have been persisted
      const lastCall = mockFs.writeFileSync.mock.calls[mockFs.writeFileSync.mock.calls.length - 1] as [string, string]
      const parsed = JSON.parse(lastCall[1])
      expect(parsed.chats['+1234567890']).toBeUndefined()
    })
  })
})
