import * as fs from 'fs'
import * as path from 'path'

/** Path to the sessions file - uses DATA_DIR env var or defaults to ./data */
export const SESSIONS_FILE_PATH = path.join(
  process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  'sessions.json'
)

/**
 * Represents a stored session for a chat (DM or group).
 */
export interface ChatSession {
  type: 'dm' | 'group'
  sessionId: string
  lastActive: string // ISO 8601 timestamp
}

/**
 * Shape of the sessions.json file.
 */
interface SessionsFile {
  chats: Record<string, ChatSession>
}

/**
 * Manages persistence of chat sessions to disk.
 *
 * Sessions are stored in /home/jarvis/data/sessions.json and map
 * chat IDs (phone numbers for DMs, group IDs for groups) to their
 * SDK session IDs. This enables resuming conversations across restarts.
 */
export class SessionStore {
  private sessions: Map<string, ChatSession> = new Map()

  constructor() {
    this.load()
  }

  /**
   * Retrieves a session for the given chat ID.
   * Returns undefined if no session exists.
   */
  getSession(chatId: string): ChatSession | undefined {
    return this.sessions.get(chatId)
  }

  /**
   * Saves or updates a session for the given chat ID.
   * Persists immediately to disk.
   */
  saveSession(chatId: string, session: ChatSession): void {
    this.sessions.set(chatId, session)
    this.persist()
    console.log(`[sessions] Saved session for ${chatId}: ${session.sessionId.substring(0, 20)}...`)
  }

  /**
   * Removes a session for the given chat ID.
   * Used when a session resume fails and we need a fresh session.
   */
  removeSession(chatId: string): void {
    this.sessions.delete(chatId)
    this.persist()
  }

  /**
   * Returns all chat IDs that have stored sessions.
   */
  listChatIds(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * Loads sessions from disk. Called once during construction.
   * Handles missing files and corrupted JSON gracefully.
   */
  private load(): void {
    if (!fs.existsSync(SESSIONS_FILE_PATH)) {
      console.log(`[sessions] No sessions file at ${SESSIONS_FILE_PATH}, starting fresh`)
      return
    }

    try {
      const content = fs.readFileSync(SESSIONS_FILE_PATH, 'utf-8')
      const data: SessionsFile = JSON.parse(content)

      if (data.chats) {
        for (const [chatId, session] of Object.entries(data.chats)) {
          this.sessions.set(chatId, session)
        }
        console.log(`[sessions] Loaded ${this.sessions.size} session(s) from ${SESSIONS_FILE_PATH}`)
      }
    } catch (error) {
      console.error(
        `[sessions] Failed to load sessions from ${SESSIONS_FILE_PATH}:`,
        error
      )
      // Start fresh - all chats will get new sessions
    }
  }

  /**
   * Persists current sessions to disk.
   * Creates the directory if it doesn't exist.
   */
  private persist(): void {
    const data: SessionsFile = {
      chats: Object.fromEntries(this.sessions),
    }

    const dir = path.dirname(SESSIONS_FILE_PATH)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(SESSIONS_FILE_PATH, JSON.stringify(data, null, 2))
  }
}
