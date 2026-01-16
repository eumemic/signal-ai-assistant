import * as fs from 'fs'
import * as path from 'path'

/**
 * Configuration for an MCP stdio server.
 */
export interface McpStdioServerConfig {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
  enabled?: boolean
}

/**
 * Configuration for an MCP SSE server.
 */
export interface McpSseServerConfig {
  type: 'sse'
  url: string
  enabled?: boolean
}

/**
 * Union of supported MCP server config types.
 */
export type McpServerConfigEntry = McpStdioServerConfig | McpSseServerConfig

/**
 * Shape of the mcp.json config file.
 */
export interface McpConfigFile {
  servers: Record<string, McpServerConfigEntry>
}

/**
 * The resolved data directory path.
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

/**
 * Path to the MCP config file.
 */
export const MCP_CONFIG_PATH = path.join(DATA_DIR, 'mcp.json')

/**
 * Resolves environment variable references in a string.
 * Supports ${VAR_NAME} syntax.
 * Also supports ${DATA_DIR} which resolves to the data directory path.
 */
function resolveEnvVar(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    // Special case: DATA_DIR resolves to the computed data directory
    if (varName === 'DATA_DIR') {
      return DATA_DIR
    }
    return process.env[varName] || ''
  })
}

/**
 * Resolves environment variables in server config.
 * Handles env vars in command, args, and env fields.
 */
function resolveServerConfig(
  config: McpServerConfigEntry
): McpServerConfigEntry {
  if (config.type === 'stdio') {
    const resolved: McpStdioServerConfig = {
      ...config,
      command: resolveEnvVar(config.command),
      args: config.args?.map(resolveEnvVar),
    }

    // Resolve env values and filter out empty ones
    if (config.env) {
      resolved.env = {}
      for (const [key, value] of Object.entries(config.env)) {
        const resolvedValue = resolveEnvVar(value)
        if (resolvedValue) {
          resolved.env[key] = resolvedValue
        }
      }
    }

    return resolved
  }

  if (config.type === 'sse') {
    return {
      ...config,
      url: resolveEnvVar(config.url),
    }
  }

  return config
}

/**
 * Loads MCP server configurations from data/mcp.json.
 *
 * Returns only enabled servers with environment variables resolved.
 * If the config file doesn't exist or is invalid, returns an empty record.
 *
 * Environment variables can be referenced in config values using ${VAR_NAME} syntax:
 * ```json
 * {
 *   "servers": {
 *     "meme": {
 *       "type": "stdio",
 *       "command": "meme-mcp",
 *       "env": {
 *         "IMGFLIP_USERNAME": "${IMGFLIP_USERNAME}",
 *         "IMGFLIP_PASSWORD": "${IMGFLIP_PASSWORD}"
 *       }
 *     }
 *   }
 * }
 * ```
 */
export function loadMcpServers(): Record<string, McpServerConfigEntry> {
  if (!fs.existsSync(MCP_CONFIG_PATH)) {
    console.log(`[mcp] No config file at ${MCP_CONFIG_PATH}, no MCP servers loaded`)
    return {}
  }

  try {
    const content = fs.readFileSync(MCP_CONFIG_PATH, 'utf-8')
    const config: McpConfigFile = JSON.parse(content)

    if (!config.servers || typeof config.servers !== 'object') {
      console.log('[mcp] Config file has no servers, skipping')
      return {}
    }

    const result: Record<string, McpServerConfigEntry> = {}
    let enabledCount = 0
    let disabledCount = 0

    for (const [name, serverConfig] of Object.entries(config.servers)) {
      // Skip disabled servers (enabled defaults to true if not specified)
      if (serverConfig.enabled === false) {
        disabledCount++
        continue
      }

      // Resolve environment variables
      const resolved = resolveServerConfig(serverConfig)

      // For stdio servers, warn if command might not exist
      if (resolved.type === 'stdio') {
        // Remove the enabled field before passing to SDK
        const { enabled, ...sdkConfig } = resolved
        result[name] = sdkConfig
      } else {
        const { enabled, ...sdkConfig } = resolved
        result[name] = sdkConfig
      }

      enabledCount++
    }

    console.log(
      `[mcp] Loaded ${enabledCount} MCP server(s) from ${MCP_CONFIG_PATH}` +
        (disabledCount > 0 ? ` (${disabledCount} disabled)` : '')
    )

    for (const [name, config] of Object.entries(result)) {
      if (config.type === 'stdio') {
        console.log(`[mcp]   - ${name}: ${config.command} ${config.args?.join(' ') || ''}`)
      } else if (config.type === 'sse') {
        console.log(`[mcp]   - ${name}: ${config.url}`)
      }
    }

    return result
  } catch (error) {
    console.error(`[mcp] Failed to load config from ${MCP_CONFIG_PATH}:`, error)
    return {}
  }
}
