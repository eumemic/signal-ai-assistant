#!/bin/bash
#
# Test an MCP server standalone by sending a tools/list request
#
# Usage: ./test-mcp-server.sh <path-to-mcp-binary>
#
# Example:
#   ./test-mcp-server.sh ./data/node_modules/.bin/meme-mcp
#
# Environment variables needed by the server should be set before running.

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-mcp-binary>"
    echo ""
    echo "Example:"
    echo "  export IMGFLIP_USERNAME=myuser"
    echo "  export IMGFLIP_PASSWORD=mypass"
    echo "  $0 ./data/node_modules/.bin/meme-mcp"
    exit 1
fi

MCP_SERVER="$1"

if [ ! -x "$MCP_SERVER" ] && [ ! -f "$MCP_SERVER" ]; then
    echo "Error: $MCP_SERVER not found or not executable"
    exit 1
fi

echo "Testing MCP server: $MCP_SERVER"
echo "========================================"
echo ""

# Send initialize request
echo "1. Sending initialize request..."
INIT_RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 10 node "$MCP_SERVER" 2>/dev/null || echo "TIMEOUT")

if [ "$INIT_RESPONSE" = "TIMEOUT" ]; then
    echo "   ERROR: Server timed out on initialize"
    exit 1
fi

echo "   Response: $INIT_RESPONSE" | head -c 200
echo ""
echo ""

# Send tools/list request
echo "2. Sending tools/list request..."
TOOLS_RESPONSE=$(echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | timeout 10 node "$MCP_SERVER" 2>/dev/null || echo "TIMEOUT")

if [ "$TOOLS_RESPONSE" = "TIMEOUT" ]; then
    echo "   ERROR: Server timed out on tools/list"
    exit 1
fi

echo "   Response: $TOOLS_RESPONSE" | head -c 500
echo ""
echo ""

# Parse tool names if jq is available
if command -v jq &> /dev/null; then
    echo "3. Available tools:"
    echo "$TOOLS_RESPONSE" | jq -r '.result.tools[]?.name // empty' 2>/dev/null | while read -r tool; do
        echo "   - $tool"
    done
fi

echo ""
echo "========================================"
echo "MCP server test complete"
