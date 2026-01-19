#!/bin/bash
# Start All AOD Services
# Usage: ./scripts/start-all.sh [dev|prod]

MODE="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==================================="
echo "  AI Orchestration Dashboard"
echo "  Starting in $MODE mode"
echo "==================================="

cd "$PROJECT_DIR"

if [ "$MODE" = "prod" ]; then
    echo "Starting production services..."
    docker compose up -d
else
    echo "Starting development services..."
    docker compose -f docker-compose.dev.yml up -d
fi

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check health
echo ""
echo "Checking service health..."

# Check Redis
if curl -s http://localhost:6379 > /dev/null 2>&1 || docker exec aod-redis-dev redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis: OK"
else
    echo "⏳ Redis: Starting..."
fi

# Check Backend
for i in {1..30}; do
    if curl -s http://localhost:4000/health > /dev/null 2>&1; then
        echo "✅ Backend: OK"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Backend: Failed to start"
    else
        sleep 1
    fi
done

# Check Frontend
for i in {1..30}; do
    if curl -s http://localhost:3002 > /dev/null 2>&1; then
        echo "✅ Frontend: OK"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⏳ Frontend: Still starting..."
    else
        sleep 1
    fi
done

echo ""
echo "==================================="
echo "  Services Ready!"
echo "==================================="
echo "  Dashboard: http://localhost:3002"
echo "  API:       http://localhost:4000"
echo "  Redis:     localhost:6379"
echo "==================================="
echo ""
echo "To start agents, run:"
echo "  ./agents/conductor/start.sh"
echo "  ./agents/frontend-dev/start.sh"
echo "  ./agents/backend-dev/start.sh"
echo ""
