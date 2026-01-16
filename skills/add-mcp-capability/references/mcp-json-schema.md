# mcp.json Schema Reference

Complete schema documentation for the `data/mcp.json` configuration file.

## File Location

```
signal-ai-assistant/
└── data/
    └── mcp.json
```

The loader uses `DATA_DIR` environment variable or defaults to `./data` relative to cwd.

## Top-Level Structure

```json
{
  "servers": {
    "<server-name>": { <server-config> },
    "<server-name>": { <server-config> }
  }
}
```

## Server Configuration Types

### Stdio Server (Most Common)

For MCP servers that communicate via stdin/stdout:

```json
{
  "type": "stdio",
  "command": "string (required)",
  "args": ["array", "of", "strings"],
  "env": {
    "VAR_NAME": "value"
  },
  "enabled": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"stdio"` | Yes | Server transport type |
| `command` | string | Yes | Executable path or command name |
| `args` | string[] | No | Command-line arguments |
| `env` | object | No | Environment variables for the process |
| `enabled` | boolean | No | Whether to load this server (default: true) |

### SSE Server

For remote MCP servers using Server-Sent Events:

```json
{
  "type": "sse",
  "url": "string (required)",
  "enabled": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"sse"` | Yes | Server transport type |
| `url` | string | Yes | SSE endpoint URL |
| `enabled` | boolean | No | Whether to load this server (default: true) |

### HTTP Server

For HTTP-based MCP servers:

```json
{
  "type": "http",
  "url": "string (required)",
  "enabled": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"http"` | Yes | Server transport type |
| `url` | string | Yes | HTTP endpoint URL |
| `enabled` | boolean | No | Whether to load this server (default: true) |

## Environment Variable Substitution

All string values support `${VAR_NAME}` syntax:

```json
{
  "servers": {
    "example": {
      "type": "stdio",
      "command": "${DATA_DIR}/node_modules/.bin/my-mcp",
      "env": {
        "API_KEY": "${MY_API_KEY}",
        "BASE_URL": "${API_BASE_URL}"
      }
    }
  }
}
```

### Special Variables

| Variable | Description |
|----------|-------------|
| `${DATA_DIR}` | Resolves to the data directory path (computed, not from env) |

### Resolution Behavior

- If the environment variable exists, its value is substituted
- If the environment variable doesn't exist, an empty string is substituted
- For `env` fields, empty values are filtered out (not passed to the server)

## Complete Example

```json
{
  "servers": {
    "meme": {
      "type": "stdio",
      "command": "${DATA_DIR}/node_modules/.bin/meme-mcp",
      "env": {
        "IMGFLIP_USERNAME": "${IMGFLIP_USERNAME}",
        "IMGFLIP_PASSWORD": "${IMGFLIP_PASSWORD}"
      },
      "enabled": true
    },
    "filesystem": {
      "type": "stdio",
      "command": "${DATA_DIR}/node_modules/.bin/mcp-server-filesystem",
      "args": ["/home/jarvis/workspace"],
      "enabled": true
    },
    "web-search": {
      "type": "stdio",
      "command": "${DATA_DIR}/node_modules/.bin/mcp-server-brave-search",
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      },
      "enabled": false
    },
    "remote-api": {
      "type": "sse",
      "url": "https://mcp.example.com/sse",
      "enabled": true
    }
  }
}
```

## Loader Behavior

The MCP config loader (`src/mcp.ts`):

1. Reads `data/mcp.json`
2. Filters out servers with `enabled: false`
3. Resolves all `${VAR}` references
4. Removes the `enabled` field before passing to SDK
5. Filters out empty env values
6. Returns the config to be passed to the Claude Agent SDK

### Logging

The loader logs what it loaded:

```
[mcp] Loaded 2 MCP server(s) from /path/to/data/mcp.json (1 disabled)
[mcp]   - meme: /path/to/data/node_modules/.bin/meme-mcp
[mcp]   - filesystem: /path/to/data/node_modules/.bin/mcp-server-filesystem /home/jarvis/workspace
```

### Error Handling

- Missing file: Logs warning, returns empty config
- Invalid JSON: Logs error, returns empty config
- Missing `servers` key: Logs warning, returns empty config

## Validation

Check config is valid:

```bash
# Parse and pretty-print
cat data/mcp.json | jq .

# Check a specific server
cat data/mcp.json | jq '.servers["meme"]'
```

## Integration with docker-compose.yml

Environment variables referenced in `mcp.json` must be passed through Docker:

```yaml
# docker-compose.yml
services:
  jarvis-agent:
    environment:
      - IMGFLIP_USERNAME
      - IMGFLIP_PASSWORD
      - BRAVE_API_KEY
```

Variables listed without values are passed through from the host environment or `.env` file.
