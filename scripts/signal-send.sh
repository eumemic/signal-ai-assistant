#!/bin/bash
# Wrapper script that sends Signal messages via the daemon's JSON-RPC interface
# Usage: echo "message" | signal-send.sh [-g GROUP_ID] [-q TIMESTAMP AUTHOR] RECIPIENT
#        echo "message" | signal-send.sh [-q TIMESTAMP AUTHOR] RECIPIENT
#
# Options:
#   -g GROUP_ID        Send to a group instead of a recipient
#   -q TIMESTAMP AUTHOR  Reply to a specific message (quote it)
#                        TIMESTAMP = Unix millisecond timestamp of the message
#                        AUTHOR = Phone number of the message author
#
# Message is read from stdin to avoid shell escaping issues with special characters.

DAEMON_PORT=7583

# Initialize variables
GROUP_ID=""
RECIPIENT=""
QUOTE_TIMESTAMP=""
QUOTE_AUTHOR=""

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        -g)
            GROUP_ID="$2"
            shift 2
            ;;
        -q)
            QUOTE_TIMESTAMP="$2"
            QUOTE_AUTHOR="$3"
            shift 3
            ;;
        *)
            RECIPIENT="$1"
            shift
            ;;
    esac
done

# Read message from stdin - this avoids all shell escaping issues
MESSAGE=$(cat)

# Build JSON with jq, conditionally adding quote parameters
if [ -n "$GROUP_ID" ]; then
    if [ -n "$QUOTE_TIMESTAMP" ]; then
        JSON=$(jq -c -n \
            --arg gid "$GROUP_ID" \
            --arg msg "$MESSAGE" \
            --argjson qt "$QUOTE_TIMESTAMP" \
            --arg qa "$QUOTE_AUTHOR" \
            '{"jsonrpc":"2.0","method":"send","params":{"groupId":$gid,"message":$msg,"quoteTimestamp":$qt,"quoteAuthor":$qa},"id":1}')
    else
        JSON=$(jq -c -n --arg gid "$GROUP_ID" --arg msg "$MESSAGE" \
            '{"jsonrpc":"2.0","method":"send","params":{"groupId":$gid,"message":$msg},"id":1}')
    fi
else
    if [ -n "$QUOTE_TIMESTAMP" ]; then
        JSON=$(jq -c -n \
            --arg rcpt "$RECIPIENT" \
            --arg msg "$MESSAGE" \
            --argjson qt "$QUOTE_TIMESTAMP" \
            --arg qa "$QUOTE_AUTHOR" \
            '{"jsonrpc":"2.0","method":"send","params":{"recipient":[$rcpt],"message":$msg,"quoteTimestamp":$qt,"quoteAuthor":$qa},"id":1}')
    else
        JSON=$(jq -c -n --arg rcpt "$RECIPIENT" --arg msg "$MESSAGE" \
            '{"jsonrpc":"2.0","method":"send","params":{"recipient":[$rcpt],"message":$msg},"id":1}')
    fi
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
