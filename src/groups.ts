import { execFile } from 'child_process'

/**
 * Structure of a group entry from signal-cli listGroups -d output.
 */
interface SignalGroup {
  id: string
  name?: string
  isMember?: boolean
}

/**
 * Interface for the group cache.
 */
export interface GroupCache {
  /**
   * Load groups from signal-cli. Should be called on startup.
   * Logs errors but does not throw - continues with empty cache on failure.
   */
  load(): Promise<void>

  /**
   * Get group name by ID. Returns undefined if not in cache.
   */
  getName(groupId: string): string | undefined

  /**
   * Check if a group ID is in the cache.
   */
  hasGroup(groupId: string): boolean

  /**
   * Get group name, refreshing cache if not found.
   * Use this when an unknown group ID is encountered.
   */
  getNameWithRefresh(groupId: string): Promise<string | undefined>
}

/**
 * Creates a GroupCache instance for resolving group IDs to names.
 *
 * The cache uses signal-cli listGroups to build an ID→name mapping:
 * - On startup: load() is called to populate the cache
 * - When unknown group encountered: getNameWithRefresh() triggers a reload
 *
 * @param agentPhoneNumber - The phone number to use with signal-cli
 */
export function createGroupCache(agentPhoneNumber: string): GroupCache {
  const cache = new Map<string, string>()

  function fetchGroups(): Promise<SignalGroup[]> {
    return new Promise((resolve) => {
      execFile(
        'signal-cli',
        ['-a', agentPhoneNumber, 'listGroups', '-d', '-o', 'json'],
        { encoding: 'utf8' },
        (error, stdout) => {
          if (error) {
            console.error('[groups] Failed to fetch group list:', error)
            resolve([])
            return
          }
          try {
            const parsed = JSON.parse(stdout)
            resolve(Array.isArray(parsed) ? (parsed as SignalGroup[]) : [])
          } catch (parseError) {
            console.error('[groups] Failed to fetch group list:', parseError)
            resolve([])
          }
        }
      )
    })
  }

  function updateCache(groups: SignalGroup[]): void {
    for (const group of groups) {
      if (typeof group.id === 'string' && group.id && typeof group.name === 'string') {
        cache.set(group.id, group.name)
      }
    }
  }

  return {
    async load(): Promise<void> {
      const groups = await fetchGroups()
      updateCache(groups)
    },

    getName(groupId: string): string | undefined {
      return cache.get(groupId)
    },

    hasGroup(groupId: string): boolean {
      return cache.has(groupId)
    },

    async getNameWithRefresh(groupId: string): Promise<string | undefined> {
      // Return cached value if available
      const cached = cache.get(groupId)
      if (cached !== undefined) {
        return cached
      }

      // Refresh cache and try again
      const groups = await fetchGroups()
      updateCache(groups)

      return cache.get(groupId)
    },
  }
}
