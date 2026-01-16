#!/bin/bash
# Wrapper script that sends Signal messages via the daemon's JSON-RPC interface
# Usage: echo "message" | signal-send.sh [-g GROUP_ID] [-q TIMESTAMP AUTHOR] [-a FILE...] RECIPIENT
#        echo "message" | signal-send.sh [-q TIMESTAMP AUTHOR] [-a FILE...] RECIPIENT
#
# Options:
#   -g GROUP_ID          Send to a group instead of a recipient
#   -q TIMESTAMP AUTHOR  Reply to a specific message (quote it)
#                        TIMESTAMP = Unix millisecond timestamp of the message
#                        AUTHOR = Phone number of the message author
#   -a FILE              Attach a file (image, document, etc). Can be used multiple times.
#
# Message is read from stdin to avoid shell escaping issues with special characters.
# For image-only messages, you can provide an empty message via stdin (echo "" | ...).

DAEMON_PORT=7583

# Initialize variables
GROUP_ID=""
RECIPIENT=""
QUOTE_TIMESTAMP=""
QUOTE_AUTHOR=""
ATTACHMENTS=()

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)
            echo "Usage: echo \"message\" | signal-send.sh [OPTIONS] RECIPIENT"
            echo ""
            echo "Options:"
            echo "  -g GROUP_ID          Send to a group instead of a recipient"
            echo "  -q TIMESTAMP AUTHOR  Reply to a specific message (quote it)"
            echo "  -a FILE              Attach a file (can be used multiple times)"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  echo \"Hello\" | signal-send.sh +1234567890"
            echo "  echo \"Hi group\" | signal-send.sh -g \"GROUP_ID\""
            echo "  echo \"Check this out\" | signal-send.sh -a /tmp/image.jpg +1234567890"
            echo "  echo \"\" | signal-send.sh -a /tmp/photo.jpg -g \"GROUP_ID\""
            exit 0
            ;;
        -g)
            GROUP_ID="$2"
            shift 2
            ;;
        -q)
            QUOTE_TIMESTAMP="$2"
            QUOTE_AUTHOR="$3"
            shift 3
            ;;
        -a)
            ATTACHMENTS+=("$2")
            shift 2
            ;;
        *)
            RECIPIENT="$1"
            shift
            ;;
    esac
done

# Read message from stdin - this avoids all shell escaping issues
MESSAGE=$(cat)

# Build attachments array as JSON if any attachments provided
ATTACHMENTS_JSON="null"
if [ ${#ATTACHMENTS[@]} -gt 0 ]; then
    ATTACHMENTS_JSON=$(printf '%s\n' "${ATTACHMENTS[@]}" | jq -R . | jq -s .)
fi

# Build JSON with jq, conditionally adding quote and attachment parameters
if [ -n "$GROUP_ID" ]; then
    JSON=$(jq -c -n \
        --arg gid "$GROUP_ID" \
        --arg msg "$MESSAGE" \
        --argjson attachments "$ATTACHMENTS_JSON" \
        --argjson qt "${QUOTE_TIMESTAMP:-null}" \
        --arg qa "$QUOTE_AUTHOR" \
        '{
            jsonrpc: "2.0",
            method: "send",
            params: (
                {groupId: $gid, message: $msg}
                + (if $attachments != null then {attachments: $attachments} else {} end)
                + (if $qt != null then {quoteTimestamp: $qt, quoteAuthor: $qa} else {} end)
            ),
            id: 1
        }')
else
    JSON=$(jq -c -n \
        --arg rcpt "$RECIPIENT" \
        --arg msg "$MESSAGE" \
        --argjson attachments "$ATTACHMENTS_JSON" \
        --argjson qt "${QUOTE_TIMESTAMP:-null}" \
        --arg qa "$QUOTE_AUTHOR" \
        '{
            jsonrpc: "2.0",
            method: "send",
            params: (
                {recipient: [$rcpt], message: $msg}
                + (if $attachments != null then {attachments: $attachments} else {} end)
                + (if $qt != null then {quoteTimestamp: $qt, quoteAuthor: $qa} else {} end)
            ),
            id: 1
        }')
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
