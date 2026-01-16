# Force x86_64 emulation - signal-cli's native libs don't support ARM64
FROM --platform=linux/amd64 node:22-slim

# Install signal-cli dependencies (signal-cli 0.13.2+ requires Java 21)
# Using slim (Debian-based) instead of Alpine for glibc compatibility with signal-cli native libs
# Add Adoptium repo for Java 21 since Debian Bookworm only has Java 17
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends temurin-21-jre \
    && rm -rf /var/lib/apt/lists/*

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

# Install app dependencies (ignore-scripts skips husky which is a devDependency)
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy app code
COPY dist/ ./dist/
COPY prompts/ ./prompts/
COPY scripts/ ./scripts/

CMD ["node", "dist/main.js"]
