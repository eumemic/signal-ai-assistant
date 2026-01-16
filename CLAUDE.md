# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Run with ts-node (development)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled dist/main.js (production)
npm test         # Run tests with Vitest

# signal-cli (use wrapper to auto-set config path)
./scripts/signal-cli.sh listAccounts                    # List registered accounts
./scripts/signal-cli.sh -a +1... updateProfile --name X # Update profile
./scripts/signal-cli.sh -a +1... send -m "Hi" +1...     # Send message

# Docker
docker compose up -d              # Start the agent container
docker compose logs -f            # View logs
docker compose restart            # Restart after config changes
```

## Architecture

This is a Signal messaging bot powered by OpenAI via LangChain. It polls the signal-cli-rest-api for messages and responds using an LLM.

### Event Loop (`main.ts`)

```
┌─────────────────────────────────────────────────────────┐
│                    main() loop                          │
│  - Polls signal-cli-rest-api every 1 second             │
│  - Routes events to Chat instances by conversation ID   │
│  - Maintains group membership lookup                    │
└─────────────────────────────────────────────────────────┘
```

### Chat Management (`chat.ts`)

Each conversation (1:1 or group) gets a `Chat` instance that:
- Batches consecutive messages from the same sender before processing
- Uses `TaskQueue` for serial processing (prevents race conditions)
- In groups: only responds when @-mentioned
- Uses LangChain `ConversationChain` with `BufferMemory` for context

### Signal Integration (`signal-api.ts`)

Wraps the signal-cli-rest-api endpoints:
- `GET /v1/receive/{number}` - fetch pending messages
- `POST /v2/send` - send messages
- `GET /v1/groups/{number}` - list groups

The REST API runs in Docker and handles Signal protocol encryption/decryption.

### Key Design Patterns

- **Polling architecture**: Simple 1-second polling loop, not event-driven
- **Lazy env loading**: `getEnv()` caches environment on first call
- **Message batching**: Consecutive messages from same sender merged before LLM call
- **Mention detection**: Group messages only processed if they contain `@{AgentName}`

## Environment Variables

Required in `.env`:
- `AGENT_NAME` - Display name for the bot
- `AGENT_PHONE_NUMBER` - Phone number registered with Signal (E.164 format: +1234567890)
- `OPENAI_API_KEY` - OpenAI API key

Optional:
- `SIGNAL_CLI_REST_API_URL` - defaults to `http://localhost:8080`
- `OPENAI_MODEL` - defaults to `gpt-5.2`

## Signal Registration

To register a new phone number with Signal:
1. Start the Docker container: `docker compose up -d`
2. Get a captcha token from https://signalcaptchas.org/registration/generate.html
3. Register: `curl -X POST "http://localhost:8080/v1/register/+1PHONENUMBER" -H "Content-Type: application/json" -d '{"captcha": "TOKEN"}'`
4. Verify with SMS code: `curl -X POST "http://localhost:8080/v1/register/+1PHONENUMBER/verify/CODE"`
5. Set profile: `curl -X PUT "http://localhost:8080/v1/profiles/+1PHONENUMBER" -H "Content-Type: application/json" -d '{"name": "BotName"}'`
