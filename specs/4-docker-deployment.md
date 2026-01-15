# Docker Deployment

## Job to Be Done

Contain the agent in a secure Docker sandbox.

## Key Decisions

- **Base image**: Node 22 Alpine
- **signal-cli**: Installed in container (no separate REST API container)
- **Filesystem**: Container-only - no host access
- **Network**: Full internet access
- **Memory limit**: 2GB
- **Restart policy**: `unless-stopped`
- **Workspace persistence**: `/home/jarvis` is a named volume (survives rebuilds)

## Container Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Docker Compose Stack                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   jarvis-agent                        │   │
│  │                                                       │   │
│  │  - Node 22 Alpine                                     │   │
│  │  - signal-cli + Java runtime                          │   │
│  │  - Agent code                                         │   │
│  │                                                       │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │                                │
│         ┌───────────────────┼───────────────────┐           │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ signal-data │    │jarvis-workspace│  │             │     │
│  │   volume    │    │    volume    │    │             │     │
│  │ (keys/cfg)  │    │ (notes/data) │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Dockerfile

```dockerfile
FROM node:22-alpine

# Install signal-cli dependencies
RUN apk add --no-cache \
    openjdk17-jre-headless \
    curl \
    bash

# Install signal-cli
ARG SIGNAL_CLI_VERSION=0.13.2
RUN curl -L -o /tmp/signal-cli.tar.gz \
    "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" \
    && tar xf /tmp/signal-cli.tar.gz -C /opt \
    && ln -s /opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli /usr/local/bin/signal-cli \
    && rm /tmp/signal-cli.tar.gz

# Create agent workspace
RUN mkdir -p /home/jarvis/{notes,downloads,scripts,data}
WORKDIR /home/jarvis

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app code
COPY dist/ ./dist/
COPY prompts/ ./prompts/

CMD ["node", "dist/main.js"]
```

## docker-compose.yml

```yaml
services:
  jarvis-agent:
    build: .
    restart: unless-stopped
    mem_limit: 2g
    volumes:
      - signal-data:/root/.local/share/signal-cli
      - jarvis-workspace:/home/jarvis
    environment:
      # See 1-agent-foundation.md for full environment variable documentation
      - ANTHROPIC_API_KEY
      - ANTHROPIC_MODEL
      - AGENT_NAME
      - AGENT_PHONE_NUMBER

volumes:
  signal-data:
  jarvis-workspace:
```

## Security Model

### Agent CAN:
- Execute shell commands inside container
- Read/write files within container
- Make network requests to any host
- Send/receive Signal messages
- Access signal-cli config (encryption keys)

### Agent CANNOT:
- Access host filesystem
- Exceed 2GB memory
- Persist data outside container (except signal-data volume)

### Trust Model

The sandbox protects the **host** from the **agent**. It does not protect:
- Users from each other (discretion is prompting)
- Signal account from misuse (agent has full access)
- External systems (agent has network access)

## Signal Registration

One-time setup before agent can operate:

```bash
# Start container with shell
docker compose run --rm jarvis-agent sh

# Inside container:

# 1. Get captcha from https://signalcaptchas.org/registration/generate.html

# 2. Register
signal-cli -a +1PHONENUMBER register --captcha "CAPTCHA_TOKEN"

# 3. Verify with SMS code
signal-cli -a +1PHONENUMBER verify CODE

# 4. Set profile name
signal-cli -a +1PHONENUMBER updateProfile --given-name "Jarvis"
```

Keys stored in signal-data volume persist after registration.

## Volume Details

### signal-data

| Property | Value |
|----------|-------|
| Purpose | signal-cli config, encryption keys, contacts |
| Container path | `/root/.local/share/signal-cli` |
| Managed by | Docker (named volume) |
| Survives | Container restarts AND rebuilds |

This volume contains sensitive data (Signal encryption keys). Handle with care.

### jarvis-workspace

| Property | Value |
|----------|-------|
| Purpose | Agent's notes, downloads, scripts, data |
| Container path | `/home/jarvis` |
| Managed by | Docker (named volume) |
| Survives | Container restarts AND rebuilds |

Contents:
```
/home/jarvis/
├── notes/          # Agent's notes and reminders
├── downloads/      # Downloaded files and attachments
├── scripts/        # Helper scripts the agent creates
└── data/           # Structured data the agent maintains
    └── sessions.json   # SDK session IDs (see 1-agent-foundation.md for format)
```

## Acceptance Criteria

1. `docker compose up` starts the orchestrator container
2. Container has signal-cli available and functional
3. Agents can send/receive messages
4. Container cannot access host filesystem
5. Container limited to 2GB memory
6. Container restarts on crash (unless manually stopped)
7. signal-cli data persists across restarts and rebuilds
8. Environment variables passed correctly
9. Agent workspace (`/home/jarvis`) persists across restarts and rebuilds
10. Downloaded attachments are saved to `/home/jarvis/downloads/`
11. Session persistence works correctly (see `1-agent-foundation.md` for session behavior)

## Edge Cases

| Scenario | Handling |
|----------|----------|
| signal-cli not registered | Container starts, commands fail with auth errors |
| Memory limit exceeded | Container killed, restarts via policy |
| Network unavailable | Commands fail, agents see errors |
| Volume missing | signal-cli fails, re-registration required |
| sessions.json missing/corrupted/resume fails | See `1-agent-foundation.md` edge cases |

## Constraints

- signal-cli requires Java (~200MB added to image)
- Alpine musl libc compatible with signal-cli
- Only orchestrator runs `signal-cli receive`
