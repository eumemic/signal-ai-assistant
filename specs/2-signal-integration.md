# Signal Integration

## Job to Be Done

Integrate with Signal via signal-cli for bidirectional messaging, routing messages to per-chat mailboxes that wake agents.

## Key Decisions

- **Direct signal-cli**: No REST API wrapper - agents use signal-cli directly
- **Receive pattern**: Single receiver loop with `signal-cli receive -t -1 --json`
- **Routing**: Messages routed to per-chat mailboxes by chat ID
- **Send pattern**: Agents run signal-cli commands via Bash tool
- **Message format**: ISO 8601 timestamps + sender identification
- **Attachments**: Images and documents supported; audio/video out of scope
- **Self-messages**: Filtered out - agents don't see their own sent messages
- **Contact names**: Use phone number when `sourceName` is empty
- **Retry backoff**: Exponential 1s→60s cap on receive failures

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Orchestrator                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Receiver Loop (single)                      │    │
│  │  signal-cli receive -t -1 --json                                 │    │
│  │  → Runs continuously in main process                             │    │
│  │  → Parses JSON, extracts chat ID, routes to mailbox              │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│                    ┌───────────┴───────────┐                            │
│                    │   Route by Chat ID    │                            │
│                    │  DM: source phone     │                            │
│                    │  Group: groupId       │                            │
│                    └───────────┬───────────┘                            │
│                                │                                         │
│     ┌──────────────────────────┼──────────────────────────┐             │
│     ▼                          ▼                          ▼             │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐         │
│  │  Mailbox    │        │  Mailbox    │        │  Mailbox    │         │
│  │ +123456789  │        │ +098765432  │        │ Z3JvdXBf... │         │
│  │ (DM: Tom)   │        │ (DM: Sarah) │        │ (Family)    │         │
│  │ [msg queue] │        │ [msg queue] │        │ [msg queue] │         │
│  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘         │
│         │                      │                      │                 │
│         ▼                      ▼                      ▼                 │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐         │
│  │   Agent     │        │   Agent     │        │   Agent     │         │
│  │ (DM prompt) │        │ (DM prompt) │        │(Group prompt)│        │
│  │  session_1  │        │  session_2  │        │  session_3  │         │
│  └─────────────┘        └─────────────┘        └─────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Receiver Loop

Single process receives all messages and routes to mailboxes:

```typescript
while (true) {
  const messages = await receiveMessages();  // signal-cli receive -t -1 --json
  for (const msg of messages) {
    const chatId = extractChatId(msg);       // groupId or source phone
    const mailbox = getOrCreateMailbox(chatId);
    mailbox.enqueue(formatMessage(msg));
    mailbox.wake();                          // Signal agent if idle
  }
}
```

## Mailbox Model

Each chat has an in-memory mailbox that queues messages for its agent:

```typescript
interface Mailbox {
  chatId: string;
  type: 'dm' | 'group';
  queue: FormattedMessage[];
  agent: Agent | null;           // null = not yet created (lazy)
  agentBusy: boolean;            // true while agent turn in progress
}
```

### Wake Behavior

When a message arrives:
1. Enqueue message to mailbox
2. If agent doesn't exist → create agent (lazy), start turn with message
3. If agent exists and idle → start turn with queued messages
4. If agent exists and busy → message waits in queue

When agent turn completes:
1. Check mailbox queue
2. If messages pending → start new turn immediately with all queued messages
3. If queue empty → agent goes idle, waits for wake signal

### Batch Delivery

When starting a turn, all queued messages are delivered at once as a single user message:

```
New messages:

[2024-01-15T10:30:45Z] Tom (+1234567890): Hey, quick question
[2024-01-15T10:30:52Z] Tom (+1234567890): Actually two questions
[2024-01-15T10:31:01Z] Tom (+1234567890): Never mind, figured it out!
```

## Chat ID Extraction

Messages are routed by chat ID:

| Message Type | Chat ID | Example |
|--------------|---------|---------|
| Group message | `envelope.dataMessage.groupInfo.groupId` | `Z3JvdXBfYWJjMTIz==` |
| Direct message | `envelope.source` (phone number) | `+1234567890` |

## Receiving Messages

### Command

```bash
signal-cli -a $AGENT_PHONE_NUMBER receive -t -1 --json
```

- `-t -1`: Indefinite timeout (block until messages arrive)
- `--json`: One JSON object per line

### JSON Output Structure

```json
{
  "envelope": {
    "source": "+1234567890",
    "sourceNumber": "+1234567890",
    "sourceName": "Tom",
    "timestamp": 1705312245123,
    "dataMessage": {
      "message": "Hello everyone!",
      "groupInfo": {
        "groupId": "base64encodedgroupid=="
      }
    }
  }
}
```

### Message Types

| Type | Detection | Action |
|------|-----------|--------|
| Text message | `dataMessage.message` present | Format and add to context |
| Group message | `dataMessage.groupInfo` present | Include group ID in format |
| Reaction | `dataMessage.reaction` present | Format as reaction event (see below) |
| Receipt | `receiptMessage` present | Ignore |
| Typing indicator | `typingMessage` present | Ignore |
| Self-message | `source === AGENT_PHONE_NUMBER` | Filter out - don't add to context |
| Attachment | `dataMessage.attachments` present | Handle images/docs (see below) |

## Message Format

Messages are formatted for the agent's context. Since each agent only handles one chat, the chat label is omitted from messages (the agent knows which chat it's in from its system prompt).

### Text Messages

```
[{timestamp}] {senderName} ({senderPhone}): {messageText}
```

Example:
```
[2024-01-15T10:30:45Z] Tom (+1234567890): Hey, what's for dinner?
```

### Reactions

```
[{timestamp}] {reactorName} ({reactorPhone}) reacted {emoji} to msg@{targetTimestamp} from {authorName}: "{messagePreview}"
```

Example:
```
[2024-01-15T10:31:00Z] Sarah (+0987654321) reacted 👍 to msg@1705312245123 from Tom: "Hey, what's..."
```

The `targetTimestamp` is the Signal timestamp of the original message (needed for the agent to react back).

### Attachments

Images and documents are saved to `/home/jarvis/downloads/` and presented to Claude.

#### Images

Images are passed inline to Claude (multimodal) AND saved to disk:

```
[{timestamp}] {senderName} ({senderPhone}): [Image: /home/jarvis/downloads/{filename}]
{inline image passed to Claude's vision}
```

#### Documents (PDFs, etc.)

Documents are saved to disk; agent uses Read tool to view:

```
[{timestamp}] {senderName} ({senderPhone}): [Document: /home/jarvis/downloads/{filename}]
```

#### Unsupported (audio/video)

```
[{timestamp}] {senderName} ({senderPhone}): [Unsupported attachment: {mimeType}]
```

### Contact Name Resolution

- Use `sourceName` from signal-cli when present
- Fall back to phone number when `sourceName` is empty: `+1234567890 (+1234567890)`

### Group Name Resolution

signal-cli receive only provides `groupId` (base64 encoded). To get names:

1. On startup: Run `signal-cli listGroups -d` to build ID→name mapping
2. Cache in memory
3. Refresh when unknown group ID encountered
4. Group name and ID are provided in agent's system prompt (not per-message)

## Sending Messages

The agent uses signal-cli directly via bash. Common patterns:

### Send to a person

```bash
signal-cli -a $AGENT_PHONE_NUMBER send -m "Your message" +1234567890
```

### Send to a group

```bash
signal-cli -a $AGENT_PHONE_NUMBER send -m "Your message" -g "GROUP_ID"
```

### React to a message

```bash
signal-cli -a $AGENT_PHONE_NUMBER sendReaction \
  -e "👍" \
  -a +1234567890 \
  -t 1705312245123 \
  +1234567890
```

Where:
- `-e`: Emoji
- `-a`: Original message author
- `-t`: Original message timestamp
- Final arg: Recipient (person or use `-g` for group)

### Send with attachment

```bash
signal-cli -a $AGENT_PHONE_NUMBER send -m "Check this out" -a /path/to/file.jpg +1234567890
```

### List groups

```bash
signal-cli -a $AGENT_PHONE_NUMBER listGroups -d
```

## Command Blocking

The agent must not run `signal-cli receive` as it conflicts with the orchestrator.

### Implementation

SDK tool validation callback intercepts bash commands:

```typescript
canUseTool(toolCall) {
  if (toolCall.tool === 'bash') {
    const command = toolCall.input.command;
    if (command.includes('signal-cli') && command.includes('receive')) {
      return {
        allowed: false,
        reason: "signal-cli receive is managed by the system. Messages are automatically delivered to your context."
      };
    }
  }
  return { allowed: true };
}
```

## Acceptance Criteria

1. Single receiver loop runs `signal-cli receive -t -1 --json` continuously
2. Messages are routed to per-chat mailboxes by chat ID
3. Mailboxes queue messages while agent is busy
4. Agents wake immediately when mailbox receives message (if idle)
5. All queued messages delivered as batch when agent turn starts
6. Messages are formatted with ISO 8601 timestamps
7. Group names are resolved from IDs and provided in system prompt
8. Agents can send messages via signal-cli
9. Agents can react to messages via signal-cli
10. Agents can send attachments
11. Agents cannot run `signal-cli receive` (blocked)
12. Self-messages (from agent's phone number) are filtered out
13. Images are saved to disk AND passed inline to Claude
14. Documents are saved to disk for agent to read
15. Reactions include target message timestamp
16. Failed receives trigger exponential backoff (1s→60s)

## Retry Backoff

When `signal-cli receive` fails, use exponential backoff:

- Initial delay: 1 second
- Multiplier: 2x
- Maximum delay: 60 seconds
- Sequence: 1s → 2s → 4s → 8s → 16s → 32s → 60s → 60s...

Reset backoff to 1s after successful receive.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| signal-cli receive fails | Log error, retry with exponential backoff (1s→60s) |
| Malformed JSON line | Log and skip, continue processing |
| Unknown group ID | Create mailbox with ID as name, trigger group list refresh |
| Unknown DM sender | Create mailbox with phone number as identifier |
| Empty message | Skip (receipts, typing indicators) |
| Agent tries receive | Block with explanation |
| Network unavailable | Commands fail, agent sees error output |
| Self-message received | Filter out - don't route to any mailbox |
| Empty sourceName | Use phone number as display name |
| Image attachment | Save to disk + pass inline to Claude |
| Document attachment | Save to disk, agent uses Read tool |
| Audio/video attachment | Log as unsupported, skip |
| Agent turn times out | See `1-agent-foundation.md` for timeout configuration |
| Message arrives during agent turn | Queue in mailbox, delivered after turn completes |

## Constraints

- Only one process can run `signal-cli receive` per account
- signal-cli must be registered before use
- Group names require separate lookup command
- Mailboxes are in-memory only (messages lost on crash, but that's acceptable) - note this is distinct from SDK session persistence which survives restarts (see `1-agent-foundation.md`)
