#!/bin/bash
# Wrapper script that sends Signal messages via the daemon's JSON-RPC interface
# Usage: signal-send.sh [-g GROUP_ID] RECIPIENT MESSAGE
#        signal-send.sh RECIPIENT MESSAGE

DAEMON_PORT=7583

# Parse arguments
if [ "$1" = "-g" ]; then
    # Group message
    GROUP_ID="$2"
    MESSAGE="$3"
else
    # Direct message
    RECIPIENT="$1"
    MESSAGE="$2"
fi

# Remove backslash escapes that the SDK's shell execution adds before special chars
# The SDK escapes ! $ and other chars for shell safety, but we need the raw text
MESSAGE="${MESSAGE//\\!/!}"
MESSAGE="${MESSAGE//\\\$/\$}"

# Use jq for proper JSON encoding
if [ -n "$GROUP_ID" ]; then
    JSON=$(jq -c -n --arg gid "$GROUP_ID" --arg msg "$MESSAGE" \
        '{"jsonrpc":"2.0","method":"send","params":{"groupId":$gid,"message":$msg},"id":1}')
else
    JSON=$(jq -c -n --arg rcpt "$RECIPIENT" --arg msg "$MESSAGE" \
        '{"jsonrpc":"2.0","method":"send","params":{"recipient":[$rcpt],"message":$msg},"id":1}')
fi

# Send to daemon via bash's built-in TCP support
# This is more reliable than nc on macOS
exec 3<>/dev/tcp/localhost/$DAEMON_PORT
printf '%s\n' "$JSON" >&3
read -r RESULT <&3
exec 3>&-

# Check for success in response
if echo "$RESULT" | grep -q '"type":"SUCCESS"'; then
    echo "Message sent successfully"
    exit 0
elif echo "$RESULT" | grep -q '"error"'; then
    echo "Error: $RESULT" >&2
    exit 1
else
    echo "$RESULT"
    exit 0
fi
