# Agent Foundation

## Job to Be Done

Set up a Claude Agent SDK runtime with full tooling capabilities, supporting multiple concurrent chat agents.

## Key Decisions

- **SDK**: `@anthropic-ai/claude-agent-sdk` (TypeScript) with V2 preview API
- **Model**: `claude-sonnet-4-5-20250514` by default, configurable via `ANTHROPIC_MODEL`
- **Agent model**: One agent per chat (DM or group), isolated contexts
- **Agent creation**: Lazy - created on first message from unknown chat
- **Session persistence**: Resume sessions across restarts via `/home/jarvis/data/sessions.json`
- **Configuration**: Environment variables only (no config files)
- **Error handling**: Log and continue - resilient to individual agent failures
- **Node version**: Node.js 22 LTS
- **Context management**: Use SDK's built-in compaction with default settings
- **Turn timeout**: 10 minutes maximum per agent turn
- **Concurrency**: No limit on concurrent agent turns

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-5-20250514` | Claude model to use |
| `AGENT_NAME` | Yes | - | Display name (e.g., "Jarvis") |
| `AGENT_PHONE_NUMBER` | Yes | - | Signal phone number (E.164 format) |

## Available Tools

Jarvis has the full Claude Code toolset:

### Shell Execution

**Bash** - Execute any shell command in the container. Working directory is `/home/jarvis`.

### File Operations

| Tool | Purpose |
|------|---------|
| **Read** | Read file contents |
| **Write** | Create or overwrite files |
| **Edit** | Make targeted edits to existing files |
| **Glob** | Find files by pattern |
| **Grep** | Search file contents with regex |

### Web Access

| Tool | Purpose |
|------|---------|
| **WebSearch** | Search the web for information |
| **WebFetch** | Fetch and process content from URLs |

### Signal Operations

Jarvis uses `signal-cli` directly via the Bash tool for all Signal operations. See Signal Integration spec for details.

### Pass Tool

**pass(reason?: string)** - Explicitly do nothing this turn. Used when the agent observes messages but chooses not to engage.

Implemented as a custom MCP tool via the SDK's `tool()` helper:

```typescript
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const passTool = tool(
  'pass',
  'Explicitly do nothing this turn. Use when observing messages but choosing not to engage.',
  { reason: z.string().optional().describe('Why you are passing') },
  async ({ reason }) => {
    console.log(`[pass] ${reason || 'No reason given'}`)
    return { content: [{ type: 'text', text: 'Acknowledged - no action taken.' }] }
  }
)
```

## Blocked Operations

| Command | Reason | Enforcement |
|---------|--------|-------------|
| `signal-cli receive` | Conflicts with orchestrator's receive loop | SDK tool validation callback |

See `2-signal-integration.md` for implementation details on command blocking.

## Working Directory

Jarvis has a dedicated workspace at `/home/jarvis`. See `4-docker-deployment.md` for the full directory structure and volume configuration.

### Session Storage

Session IDs are stored in `/home/jarvis/data/sessions.json`:

```json
{
  "chats": {
    "+1234567890": {
      "type": "dm",
      "sessionId": "session_abc123",
      "lastActive": "2024-01-15T10:30:45Z"
    },
    "Z3JvdXBfYWJjMTIz==": {
      "type": "group",
      "sessionId": "session_def456",
      "lastActive": "2024-01-15T11:00:00Z"
    }
  }
}
```

On startup, existing sessions are resumed via `unstable_v2_resumeSession(sessionId)`. New chats get fresh sessions via `unstable_v2_createSession()`.

## Observability

Everything streams to stdout with ISO 8601 timestamps. Each log line includes the chat ID for correlation:

```
2024-01-15T10:30:45.123Z [receiver] Message from Tom (+1234567890) in Family Chat
2024-01-15T10:30:45.124Z [mailbox:Z3JvdXBfYWJj==] Queued message, 1 pending
2024-01-15T10:30:45.125Z [agent:Z3JvdXBfYWJj==] Waking up with 1 message(s)
2024-01-15T10:30:45.456Z [agent:Z3JvdXBfYWJj==] [thinking] Considering whether to respond...
2024-01-15T10:30:46.789Z [agent:Z3JvdXBfYWJj==] [bash] signal-cli -a +1234567890 send -m "How about tacos?" -g "Z3JvdXBfYWJj=="
2024-01-15T10:30:47.012Z [agent:Z3JvdXBfYWJj==] [bash_result] Message sent successfully
2024-01-15T10:30:47.100Z [agent:Z3JvdXBfYWJj==] Turn complete, checking mailbox
2024-01-15T10:30:47.101Z [agent:Z3JvdXBfYWJj==] Mailbox empty, going idle
```

Log types:
- `[receiver]` - Message received from signal-cli
- `[mailbox:{chatId}]` - Message queued to mailbox
- `[agent:{chatId}]` - Agent activity for specific chat
- `[thinking]` - Agent reasoning (if streaming supported)
- `[bash]` / `[tool_call]` - Tool invocations
- `[bash_result]` / `[tool_result]` - Tool outputs
- `[pass]` - Agent explicitly chose not to respond

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main.ts` | Replace | Orchestrator: receiver loop, mailboxes, agent management |
| `src/env.ts` | Modify | Update env vars (remove OpenAI, add Anthropic) |
| `package.json` | Modify | Replace langchain/openai with claude-agent-sdk |
| `prompts/common.md` | Create | Shared prompt prefix (identity, tools, constraints) |
| `prompts/dm.md` | Create | DM-specific prompt (always respond) |
| `prompts/group.md` | Create | Group-specific prompt (discretion, pass tool) |

## Files to Remove

| File | Reason |
|------|--------|
| `src/chat.ts` | Replaced by per-chat agent model |
| `src/signal-api.ts` | Replaced by direct signal-cli usage |

## Acceptance Criteria

1. Orchestrator initializes successfully with `ANTHROPIC_API_KEY`
2. Agents use configured model (or default)
3. One agent is created per chat (DM or group) on first message
4. Agents have isolated SDK sessions (no cross-chat context)
5. Sessions are persisted to `sessions.json` and resumed on restart
6. Agents have access to all specified tools
7. Agents can execute bash commands (except blocked ones)
8. Agents can read/write files in container
9. Agents can search web and fetch URLs
10. All activity streams to stdout with timestamps and chat IDs
11. Individual agent errors don't crash the orchestrator

## Edge Cases

- **Missing API key**: Fail fast with clear error at startup
- **Invalid model**: Let SDK handle validation
- **Tool timeout**: Reasonable timeouts on long-running commands
- **Network failure**: Log and continue; tools return errors
- **Turn timeout (10 min)**: Log timeout, agent goes idle, check mailbox on next message
- **Session resume fails**: Log warning, create fresh session for that chat
- **Corrupted sessions.json**: Log error, start fresh (all chats get new sessions)
- **Agent crash**: Log error, recreate agent on next message to that chat

## Future Extensibility

Not in scope for initial implementation:
- Claude Skills
- MCP Servers
- Plugin system
- Cross-chat awareness tool (inspect other chat logs with permission)

These will use standard Claude Code patterns when added.
