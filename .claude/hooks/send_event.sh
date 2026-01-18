#!/bin/bash
# Claude Code Hook: Send events to AI Orchestration Dashboard
# Shell script wrapper for environments without Python

AOD_API_URL="${AOD_API_URL:-http://localhost:4000}"
HOOK_NAME="${1:-unknown}"

# Read input from stdin
INPUT=$(cat)

# Skip if no input
if [ -z "$INPUT" ]; then
    exit 0
fi

# Get current timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build JSON payload
PAYLOAD=$(cat <<EOF
{
    "event_type": "${HOOK_NAME}",
    "timestamp": "${TIMESTAMP}",
    "payload": {
        "hook_name": "${HOOK_NAME}",
        "raw_data": ${INPUT}
    }
}
EOF
)

# Send to API
curl -s -X POST "${AOD_API_URL}/api/events" \
    -H "Content-Type: application/json" \
    -d "${PAYLOAD}" > /dev/null 2>&1

exit 0
