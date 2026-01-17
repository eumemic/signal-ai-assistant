# Multi-arch build: native ARM64 with patched libsignal, or x86_64 as-is
FROM node:22-slim

# Install signal-cli dependencies (signal-cli 0.13.2+ requires Java 21)
# Using slim (Debian-based) instead of Alpine for glibc compatibility with signal-cli native libs
# Add Adoptium repo for Java 21 since Debian Bookworm only has Java 17
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    jq \
    zip \
    && curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends temurin-21-jre \
    && rm -rf /var/lib/apt/lists/*

# Install signal-cli (in /opt only, no symlink to keep it hidden from agent)
ARG SIGNAL_CLI_VERSION=0.13.22
RUN curl -L -o /tmp/signal-cli.tar.gz \
    "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" \
    && tar xf /tmp/signal-cli.tar.gz -C /opt \
    && rm /tmp/signal-cli.tar.gz
# Note: signal-cli is at /opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli
# No symlink created - agent should use signal-send.sh and signal-react.sh instead

# Patch ARM64 native library if building for ARM64
# signal-cli bundles x86_64-only native libs; we replace with ARM64 builds from exquo/signal-libs-build
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ]; then \
      LIBSIGNAL_JAR=$(ls /opt/signal-cli-${SIGNAL_CLI_VERSION}/lib/libsignal-client-*.jar) && \
      LIBSIGNAL_VERSION=$(basename "$LIBSIGNAL_JAR" | sed 's/libsignal-client-\(.*\)\.jar/\1/') && \
      echo "Patching libsignal $LIBSIGNAL_VERSION for ARM64..." && \
      curl -L -o /tmp/libsignal_jni.tar.gz \
        "https://github.com/exquo/signal-libs-build/releases/download/libsignal_v${LIBSIGNAL_VERSION}/libsignal_jni.so-v${LIBSIGNAL_VERSION}-aarch64-unknown-linux-gnu.tar.gz" && \
      tar xf /tmp/libsignal_jni.tar.gz -C /tmp && \
      zip -d "$LIBSIGNAL_JAR" libsignal_jni_amd64.so || true && \
      cd /tmp && zip "$LIBSIGNAL_JAR" libsignal_jni.so && \
      rm /tmp/libsignal_jni.tar.gz /tmp/libsignal_jni.so; \
    fi

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

# Add scripts to PATH so agent can use simple command names
ENV PATH="/home/jarvis/scripts:$PATH"

CMD ["node", "dist/main.js"]
