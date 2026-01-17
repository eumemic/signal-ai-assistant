#!/bin/bash
# Wrapper script that sends Signal reactions via the daemon's JSON-RPC interface
# Usage: signal-react.sh [-g GROUP_ID] EMOJI TARGET_TIMESTAMP TARGET_AUTHOR RECIPIENT
#        signal-react.sh -g GROUP_ID EMOJI TARGET_TIMESTAMP TARGET_AUTHOR
#
# Arguments:
#   EMOJI            The emoji to react with (e.g., "👍", "❤️", "😂")
#   TARGET_TIMESTAMP Unix millisecond timestamp of the message to react to
#   TARGET_AUTHOR    Phone number of the message author
#   RECIPIENT        Phone number to send the reaction to (not needed for groups)
#
# Options:
#   -g GROUP_ID      Send reaction in a group chat
#   -r               Remove the reaction instead of adding it
#
# Examples:
#   signal-react.sh "👍" 1673300971438 +1234567890 +1234567890
#   signal-react.sh -g "GROUP_ID" "❤️" 1673300971438 +1234567890
#   signal-react.sh -r "👍" 1673300971438 +1234567890 +1234567890  # Remove reaction

DAEMON_PORT=7583

# Initialize variables
GROUP_ID=""
REMOVE=false

# Handle --help before getopts (which doesn't support long options)
for arg in "$@"; do
    if [ "$arg" = "--help" ]; then
        set -- "-h"
        break
    fi
done

# Parse options
while getopts "g:rh" opt; do
    case "$opt" in
        g)
            GROUP_ID="$OPTARG"
            ;;
        r)
            REMOVE=true
            ;;
        h)
            echo "Usage: signal-react.sh [OPTIONS] EMOJI TARGET_TIMESTAMP TARGET_AUTHOR [RECIPIENT]"
            echo ""
            echo "Arguments:"
            echo "  EMOJI            The emoji to react with (e.g., \"👍\", \"❤️\")"
            echo "  TARGET_TIMESTAMP Unix millisecond timestamp of the message"
            echo "  TARGET_AUTHOR    Phone number of the message author"
            echo "  RECIPIENT        Phone number (not needed for groups)"
            echo ""
            echo "Options:"
            echo "  -g GROUP_ID      Send reaction in a group chat"
            echo "  -r               Remove the reaction instead of adding it"
            echo "  -h               Show this help message"
            echo ""
            echo "Examples:"
            echo "  signal-react.sh \"👍\" 1673300971438 +1234567890 +1234567890"
            echo "  signal-react.sh -g \"GROUP_ID\" \"❤️\" 1673300971438 +1234567890"
            exit 0
            ;;
        *)
            echo "Unknown option: $opt" >&2
            exit 1
            ;;
    esac
done
shift $((OPTIND-1))

# Parse positional arguments
EMOJI="$1"
TARGET_TIMESTAMP="$2"
TARGET_AUTHOR="$3"
RECIPIENT="$4"

# Validate required arguments
if [ -z "$EMOJI" ] || [ -z "$TARGET_TIMESTAMP" ] || [ -z "$TARGET_AUTHOR" ]; then
    echo "Error: EMOJI, TARGET_TIMESTAMP, and TARGET_AUTHOR are required" >&2
    echo "Usage: signal-react.sh [OPTIONS] EMOJI TARGET_TIMESTAMP TARGET_AUTHOR [RECIPIENT]" >&2
    exit 1
fi

# For non-group messages, RECIPIENT is required
if [ -z "$GROUP_ID" ] && [ -z "$RECIPIENT" ]; then
    echo "Error: RECIPIENT is required for non-group messages" >&2
    exit 1
fi

# Build JSON with jq
if [ -n "$GROUP_ID" ]; then
    JSON=$(jq -c -n \
        --arg emoji "$EMOJI" \
        --argjson timestamp "$TARGET_TIMESTAMP" \
        --arg author "$TARGET_AUTHOR" \
        --arg gid "$GROUP_ID" \
        --argjson remove "$REMOVE" \
        '{
            jsonrpc: "2.0",
            method: "sendReaction",
            params: {
                groupId: $gid,
                emoji: $emoji,
                targetAuthor: $author,
                targetTimestamp: $timestamp,
                remove: $remove
            },
            id: 1
        }')
else
    JSON=$(jq -c -n \
        --arg emoji "$EMOJI" \
        --argjson timestamp "$TARGET_TIMESTAMP" \
        --arg author "$TARGET_AUTHOR" \
        --arg rcpt "$RECIPIENT" \
        --argjson remove "$REMOVE" \
        '{
            jsonrpc: "2.0",
            method: "sendReaction",
            params: {
                recipient: [$rcpt],
                emoji: $emoji,
                targetAuthor: $author,
                targetTimestamp: $timestamp,
                remove: $remove
            },
            id: 1
        }')
fi

# Send to daemon via bash's built-in TCP support
exec 3<>/dev/tcp/localhost/$DAEMON_PORT
printf '%s\n' "$JSON" >&3
read -r RESULT <&3
exec 3>&-

# Check for success in response
if echo "$RESULT" | grep -q '"type":"SUCCESS"'; then
    echo "Reaction sent successfully"
    exit 0
elif echo "$RESULT" | grep -q '"error"'; then
    echo "Error: $RESULT" >&2
    exit 1
else
    echo "$RESULT"
    exit 0
fi
