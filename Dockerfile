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
RUN npm ci --omit=dev

# Copy app code
COPY dist/ ./dist/
COPY prompts/ ./prompts/

CMD ["node", "dist/main.js"]
