# Force x86_64 emulation - signal-cli's native libs don't support ARM64
FROM --platform=linux/amd64 node:22-slim

# Install signal-cli dependencies (signal-cli 0.13.2+ requires Java 21)
# Using slim (Debian-based) instead of Alpine for glibc compatibility with signal-cli native libs
# Add Adoptium repo for Java 21 since Debian Bookworm only has Java 17
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    jq \
    && curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends temurin-21-jre \
    && rm -rf /var/lib/apt/lists/*

# Install signal-cli
ARG SIGNAL_CLI_VERSION=0.13.22
RUN curl -L -o /tmp/signal-cli.tar.gz \
    "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" \
    && tar xf /tmp/signal-cli.tar.gz -C /opt \
    && ln -s /opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli /usr/local/bin/signal-cli \
    && rm /tmp/signal-cli.tar.gz

# Create non-root user for running the agent
# Claude Code SDK's --dangerously-skip-permissions cannot run as root
RUN useradd -m -s /bin/bash jarvis

# Create agent workspace with proper ownership
RUN mkdir -p /home/jarvis/{notes,downloads,scripts,data,.claude} \
    && chown -R jarvis:jarvis /home/jarvis

WORKDIR /home/jarvis

# Install app dependencies as root (ignore-scripts skips husky which is a devDependency)
COPY --chown=jarvis:jarvis package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Install Claude Code CLI globally (required by @anthropic-ai/claude-agent-sdk)
RUN npm install -g @anthropic-ai/claude-code

# Copy app code with proper ownership
COPY --chown=jarvis:jarvis dist/ ./dist/
COPY --chown=jarvis:jarvis prompts/ ./prompts/
COPY --chown=jarvis:jarvis scripts/ ./scripts/

# Switch to non-root user
USER jarvis

CMD ["node", "dist/main.js"]
