#!/usr/bin/env bash
# Wrapper script for signal-cli that automatically uses the project's config directory
# Usage: ./scripts/signal-cli.sh [signal-cli arguments...]
#
# Examples:
#   ./scripts/signal-cli.sh listAccounts
#   ./scripts/signal-cli.sh -a +19494900411 updateProfile --name "Jarvis"
#   ./scripts/signal-cli.sh -a +19494900411 send -m "Hello" +1234567890

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_DIR/data/signal-cli-config"

exec signal-cli -c "$CONFIG_DIR" "$@"
