#!/bin/bash
# Initialize a new project with team
# Usage: ./scripts/init-project.sh --name "ProjectName" [--team-size 5]

PROJECT_NAME=""
TEAM_SIZE=5
API_URL="${AOD_API_URL:-http://localhost:4000}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            PROJECT_NAME="$2"
            shift 2
            ;;
        --team-size)
            TEAM_SIZE="$2"
            shift 2
            ;;
        --api)
            API_URL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$PROJECT_NAME" ]; then
    echo "Usage: $0 --name <project_name> [--team-size <size>]"
    exit 1
fi

PROJECT_ID=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

echo "==================================="
echo "  Initializing Project"
echo "==================================="
echo "  Project Name: $PROJECT_NAME"
echo "  Project ID:   $PROJECT_ID"
echo "  Team Size:    $TEAM_SIZE"
echo "==================================="
echo ""

# Create team
echo "Creating team..."
TEAM_RESPONSE=$(curl -s -X POST "$API_URL/api/teams" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PROJECT_NAME Team\",\"description\":\"Team for $PROJECT_NAME\",\"project_id\":\"$PROJECT_ID\"}")

TEAM_ID=$(echo "$TEAM_RESPONSE" | grep -o '"team_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TEAM_ID" ]; then
    echo "✅ Team created: $TEAM_ID"
else
    echo "❌ Failed to create team"
    echo "$TEAM_RESPONSE"
fi

# Create initial tasks
echo ""
echo "Creating initial tasks..."

# Task 1: Project Setup
curl -s -X POST "$API_URL/api/queue/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PROJECT_ID\",\"title\":\"Project Setup\",\"description\":\"Initialize project structure and dependencies\",\"priority\":1,\"required_capabilities\":[\"setup\"]}" \
  > /dev/null

# Task 2: Planning
curl -s -X POST "$API_URL/api/queue/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PROJECT_ID\",\"title\":\"Architecture Planning\",\"description\":\"Define project architecture and design patterns\",\"priority\":1,\"required_capabilities\":[\"architecture\",\"planning\"]}" \
  > /dev/null

echo "✅ Initial tasks created"

# Create shared context
echo ""
echo "Creating shared context..."

curl -s -X POST "$API_URL/api/context" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PROJECT_ID\",\"context_type\":\"decision\",\"title\":\"Project Initialized\",\"content\":\"Project $PROJECT_NAME has been initialized with team size $TEAM_SIZE\",\"author_agent_id\":\"system\"}" \
  > /dev/null

echo "✅ Shared context created"

echo ""
echo "==================================="
echo "  Project Ready!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Start services:    ./scripts/start-all.sh"
echo "2. Start conductor:   AOD_PROJECT_ID=$PROJECT_ID ./agents/conductor/start.sh"
echo "3. Start developers:  AOD_PROJECT_ID=$PROJECT_ID ./agents/frontend-dev/start.sh"
echo ""
echo "Environment variables for agents:"
echo "  export AOD_PROJECT_ID=$PROJECT_ID"
echo ""
