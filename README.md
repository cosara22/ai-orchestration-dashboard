# AI Orchestration Dashboard (AOD)

Real-time monitoring dashboard for Claude Code sessions.

## Architecture

```
+----------------+     +------------------+     +---------------+
|   Claude Code  | --> |  Hooks (Python)  | --> |  API Gateway  |
|    Sessions    |     |  send_event.py   |     |  (Bun + Hono) |
+----------------+     +------------------+     +-------+-------+
                                                       |
                    +----------------------------------+
                    |              |                   |
              +-----v-----+  +----v----+        +-----v------+
              |   Redis   |  | SQLite  |        |  WebSocket |
              | (Pub/Sub) |  |  (DB)   |        |  Clients   |
              +-----------+  +---------+        +-----+------+
                                                      |
                                               +------v------+
                                               |   Next.js   |
                                               |  Dashboard  |
                                               +-------------+
```

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js v22+
- pnpm 9+
- Bun 1.x

### Installation

1. Start infrastructure:
   ```bash
   docker compose up -d
   ```

2. Initialize database:
   ```bash
   cd server && bun run db:init
   ```

3. Start backend:
   ```bash
   cd server && bun run dev
   ```

4. Start frontend (in new terminal):
   ```bash
   cd frontend && pnpm dev
   ```

5. Open dashboard: http://localhost:3000

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js Dashboard UI |
| Backend | 4000 | Bun + Hono API Gateway |
| Redis | 6379 | Pub/Sub for real-time events |
| SQLite | - | Persistent storage (data/aod.db) |

## API Endpoints

### Health
- `GET /health` - API health check

### Events
- `GET /api/events` - List events
- `POST /api/events` - Create event
- `GET /api/events/:id` - Get event by ID

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session details
- `PATCH /api/sessions/:id` - Update session

### Metrics
- `GET /api/metrics/summary` - Dashboard metrics
- `GET /api/metrics/timeline` - Event timeline
- `GET /api/metrics/health` - System health check

### WebSocket
- `ws://localhost:4000/ws` - Real-time event stream

## Claude Code Hooks

### Enable Hooks in This Project

Copy `settings.local.json` to `settings.json`:
```bash
cp .claude/settings.local.json .claude/settings.json
```

### Enable Hooks in Other Projects

Add the following to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python /path/to/ai-orchestration-dashboard/.claude/hooks/send_event.py PostToolUse"
          }
        ]
      }
    ]
  },
  "env": {
    "AOD_API_URL": "http://localhost:4000"
  }
}
```

### Available Hooks

| Hook | Event Type | Description |
|------|------------|-------------|
| PreToolUse | tool_execution_start | Before tool execution |
| PostToolUse | tool_execution_end | After tool execution |
| Notification | notification | Notifications from Claude |
| Stop | session_end | Session ended |

See `.claude/HOOKS_README.md` for detailed setup instructions.

## Testing

Run integration tests:
```bash
bun run tests/integration.test.ts
```

## Project Structure

```
ai-orchestration-dashboard/
├── server/                 # Backend API Gateway
│   ├── src/
│   │   ├── index.ts       # Entry point
│   │   ├── routes/        # API routes
│   │   ├── lib/           # Database & Redis clients
│   │   └── ws/            # WebSocket handler
│   └── db/                # Database schema & init
├── frontend/              # Next.js Dashboard
│   └── src/
│       ├── app/           # App Router pages
│       ├── components/    # UI components
│       ├── hooks/         # React hooks
│       └── lib/           # API client & utilities
├── .claude/               # Claude Code integration
│   ├── hooks/             # Hook scripts
│   └── settings.local.json
├── data/                  # SQLite database
├── tests/                 # Integration tests
└── docker-compose.yml     # Infrastructure
```

## License

MIT
