---
name: Add MCP Capability
description: This skill should be used when the user asks to "add an MCP server", "install an MCP tool", "add a capability to Jarvis", "integrate an MCP server", "set up meme generation", "add web search to Jarvis", or mentions adding new tools or capabilities to the Signal AI assistant.
version: 1.0.0
---

# Add MCP Capability to Jarvis

This skill guides the process of adding new MCP (Model Context Protocol) server capabilities to the Jarvis Signal AI assistant.

## Overview

Jarvis loads MCP servers from `data/mcp.json`. MCP servers are installed as npm packages in `data/node_modules/` and configured to run when the agent starts. The agent then has access to the tools provided by those MCP servers.

## Key Architecture Points

- **Config file**: `data/mcp.json` defines which MCP servers to load
- **Package location**: MCP servers installed in `data/node_modules/`
- **Environment**: Same `data/` directory is mounted in both local dev and Docker
- **Env var substitution**: Config supports `${VAR_NAME}` syntax for secrets

## Adding an MCP Server

### Step 1: Research the MCP Server

Before installing, understand what the MCP server provides:
- What tools does it expose?
- What environment variables or credentials does it need?
- Is it a Node.js package (preferred) or Python?
- Does it return file paths or inline data? (File paths work better for Jarvis)

### Step 2: Install the Package

Install into the `data/` directory:

```bash
cd data
npm install <package-name>
```

**Important for Docker compatibility**: If installing from a local path, use `npm pack` first:

```bash
# From the local package directory
npm pack

# Then install the tarball in data/
cd /path/to/signal-ai-assistant/data
npm install /path/to/package-name-1.0.0.tgz
```

Direct local path installs (`npm install /path/to/local`) create symlinks that don't work across Docker mount boundaries.

### Step 3: Configure in mcp.json

Add the server to `data/mcp.json`:

```json
{
  "servers": {
    "server-name": {
      "type": "stdio",
      "command": "${DATA_DIR}/node_modules/.bin/server-binary",
      "args": ["--optional-flag"],
      "env": {
        "API_KEY": "${API_KEY_ENV_VAR}"
      },
      "enabled": true
    }
  }
}
```

Key fields:
- **type**: Usually `"stdio"` for npm packages
- **command**: Path to the executable, use `${DATA_DIR}` prefix
- **args**: Optional command-line arguments
- **env**: Environment variables passed to the server (supports `${VAR}` substitution)
- **enabled**: Set to `false` to disable without removing

### Step 4: Add Environment Variables

Add any required credentials to `.env`:

```bash
echo "API_KEY_ENV_VAR=your_api_key" >> .env
```

For Docker, also add to `docker-compose.yml` environment section:

```yaml
environment:
  - API_KEY_ENV_VAR
```

### Step 5: Restart and Test

For local development:
```bash
npm run dev
```

For Docker:
```bash
docker compose restart
```

Check the logs to verify the MCP server loaded:
```
[mcp] Loaded 1 MCP server(s) from /path/to/data/mcp.json
[mcp]   - server-name: /path/to/data/node_modules/.bin/server-binary
```

## Common Issues

### MCP Tool Returns Image Data Instead of File Path

Problem: Claude can see MCP image responses visually but cannot extract raw bytes to save to disk.

Solution: Fork the MCP server and modify it to:
1. Save the image/file to disk (e.g., `/tmp/`)
2. Return the file path as text instead of inline data

See `references/meme-mcp-fix.md` for a detailed example.

### Tool Not Available in Docker

Problem: `Error: No such tool available: mcp__server__toolName`

Causes:
1. **Symlink issue**: Local path install created symlinks that don't exist in container
   - Fix: Use `npm pack` + install from tarball
2. **Missing dependencies**: Package has native deps not in container
   - Fix: Add to Dockerfile or use pure JS alternative
3. **Env vars not passed**: Server fails silently due to missing credentials
   - Fix: Add env vars to docker-compose.yml

### Environment Variables Not Resolving

Problem: Server gets empty credentials

Check:
1. Variable is in `.env` file
2. Variable is listed in `docker-compose.yml` environment section
3. Variable name in `mcp.json` matches exactly (case-sensitive)

## MCP Server Types

### Stdio (Recommended)

Most npm MCP packages use stdio transport:

```json
{
  "type": "stdio",
  "command": "${DATA_DIR}/node_modules/.bin/mcp-server",
  "args": []
}
```

### SSE (Remote)

For remote MCP servers:

```json
{
  "type": "sse",
  "url": "https://mcp-server.example.com/sse"
}
```

### HTTP

For HTTP-based MCP servers:

```json
{
  "type": "http",
  "url": "http://localhost:3000"
}
```

## Best Practices

1. **Always test in Docker** after local testing - mount boundaries cause issues
2. **Prefer file paths over inline data** for binary content (images, PDFs)
3. **Use `${DATA_DIR}`** for portability between environments
4. **Keep secrets in `.env`** and reference via `${VAR}` syntax
5. **Set `enabled: false`** to temporarily disable servers without removing config

## Additional Resources

### Reference Files

- **`references/meme-mcp-fix.md`** - Detailed walkthrough of fixing an MCP server to return file paths
- **`references/mcp-json-schema.md`** - Full schema documentation for mcp.json

### Example Files

- **`examples/mcp.json`** - Example configuration with multiple servers

### Scripts

- **`scripts/test-mcp-server.sh`** - Test an MCP server standalone
