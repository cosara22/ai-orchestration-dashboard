#!/bin/bash
# Tester Agent Startup Script

# Configuration
AGENT_ID="${AOD_AGENT_ID:-tester-$(date +%s)}"
AGENT_NAME="${AOD_AGENT_NAME:-Tester}"
PROJECT_ID="${AOD_PROJECT_ID:-default}"
API_URL="${AOD_API_URL:-http://localhost:4000}"

# Export environment variables
export AOD_AGENT_ID="$AGENT_ID"
export AOD_AGENT_NAME="$AGENT_NAME"
export AOD_PROJECT_ID="$PROJECT_ID"
export AOD_API_URL="$API_URL"

# Register agent with AOD
echo "Registering tester agent: $AGENT_NAME ($AGENT_ID)"
curl -s -X POST "$API_URL/api/agents" \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":\"$AGENT_ID\",\"name\":\"$AGENT_NAME\",\"type\":\"worker\",\"project_id\":\"$PROJECT_ID\"}" \
  > /dev/null 2>&1

# Register capabilities
echo "Registering capabilities..."
curl -s -X POST "$API_URL/api/agents/$AGENT_ID/capabilities" \
  -H "Content-Type: application/json" \
  -d '{"capabilities":[{"tag":"testing","proficiency":95},{"tag":"playwright","proficiency":90},{"tag":"bun-test","proficiency":85},{"tag":"qa","proficiency":90}]}' \
  > /dev/null 2>&1

echo ""
echo "==================================="
echo "  Tester Agent Starting"
echo "==================================="
echo "  Agent ID:   $AGENT_ID"
echo "  Agent Name: $AGENT_NAME"
echo "  Project:    $PROJECT_ID"
echo "  API URL:    $API_URL"
echo "==================================="
echo ""

# Start Claude Code with tester CLAUDE.md
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
claude --claude-md "$SCRIPT_DIR/CLAUDE.md"
