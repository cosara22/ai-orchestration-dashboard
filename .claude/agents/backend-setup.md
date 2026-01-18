---
name: backend-setup
description: |
  AODバックエンド（API Gateway）のセットアップ。以下の場合に使用:
  (1) Bun + Hono サーバーの初期構築
  (2) REST API エンドポイントの実装
  (3) WebSocket ハンドラーの実装
model: sonnet
---

# Backend Setup Agent

Unified API Gateway (Bun + Hono) のセットアップを実行します。

## 技術スタック

| 項目 | 技術 | バージョン |
|------|------|-----------|
| Runtime | Bun | 1.x |
| Framework | Hono | 4.x |
| Validation | Zod | 3.x |
| Redis Client | ioredis | 5.x |
| SQLite | better-sqlite3 | 9.x |
| WebSocket | Bun built-in | - |

## セットアップ手順

### Step 1: プロジェクト初期化

```bash
mkdir -p server/src/{routes,services,adapters,websocket,middleware,types}
cd server
bun init -y
```

### Step 2: 依存関係インストール

```bash
bun add hono zod ioredis better-sqlite3
bun add -d @types/better-sqlite3 typescript
```

### Step 3: ディレクトリ構造作成

```
server/
├── src/
│   ├── index.ts              # エントリーポイント
│   ├── routes/
│   │   ├── agents.ts         # /api/agents
│   │   ├── tasks.ts          # /api/tasks
│   │   ├── events.ts         # /api/events
│   │   ├── metrics.ts        # /api/metrics
│   │   └── health.ts         # /health
│   ├── services/
│   │   ├── agentService.ts   # エージェント操作
│   │   ├── taskService.ts    # タスク操作
│   │   ├── eventService.ts   # イベント操作
│   │   └── metricsService.ts # メトリクス集計
│   ├── adapters/
│   │   ├── redis.ts          # Redis接続
│   │   └── sqlite.ts         # SQLite接続
│   ├── websocket/
│   │   ├── handler.ts        # WebSocketハンドラ
│   │   └── broadcaster.ts    # ブロードキャスト
│   ├── middleware/
│   │   ├── cors.ts           # CORS
│   │   ├── logger.ts         # ロギング
│   │   └── validation.ts     # バリデーション
│   └── types/
│       └── index.ts          # 型定義
├── db/
│   └── schema.sql            # スキーマ定義
├── package.json
├── tsconfig.json
└── bunfig.toml
```

### Step 4: 基本ファイル作成

#### src/index.ts
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { agentRoutes } from "./routes/agents";
import { taskRoutes } from "./routes/tasks";
import { eventRoutes } from "./routes/events";
import { metricsRoutes } from "./routes/metrics";
import { healthRoutes } from "./routes/health";
import { initializeDatabase } from "./adapters/sqlite";
import { initializeRedis } from "./adapters/redis";
import { handleWebSocket } from "./websocket/handler";

const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", logger());

// Routes
app.route("/api/agents", agentRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/metrics", metricsRoutes);
app.route("/", healthRoutes);

// Initialize
await initializeDatabase();
await initializeRedis();

// Start server
const server = Bun.serve({
  port: 4000,
  fetch: app.fetch,
  websocket: handleWebSocket,
});

console.log(`Server running at http://localhost:${server.port}`);
```

#### src/routes/health.ts
```typescript
import { Hono } from "hono";
import { getRedisStatus } from "../adapters/redis";
import { getSqliteStatus } from "../adapters/sqlite";

export const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
  const redis = await getRedisStatus();
  const sqlite = getSqliteStatus();

  const status = redis && sqlite ? "healthy" : "degraded";

  return c.json({
    status,
    version: "1.0.0",
    uptime: process.uptime(),
    checks: {
      redis: redis ? "up" : "down",
      sqlite: sqlite ? "up" : "down",
    },
  });
});
```

### Step 5: データベース初期化

```sql
-- db/schema.sql
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_app TEXT NOT NULL,
    session_id TEXT NOT NULL,
    hook_event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(hook_event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    dimensions TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
```

### Step 6: 起動スクリプト

```json
// package.json
{
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist",
    "start": "bun run dist/index.js"
  }
}
```

## 検証コマンド

```bash
# 起動
cd server && bun run dev

# Health check
curl http://localhost:4000/health

# Agents
curl http://localhost:4000/api/agents

# Tasks
curl http://localhost:4000/api/tasks

# Events (GET)
curl http://localhost:4000/api/events

# Events (POST)
curl -X POST -H "Content-Type: application/json" \
  -d '{"source_app":"test","session_id":"test-123","hook_event_type":"TestEvent","payload":{}}' \
  http://localhost:4000/api/events
```

## トラブルシューティング

### ポート競合
```bash
# ポート確認
lsof -i :4000
# または Windows
netstat -ano | findstr :4000
```

### Redis接続エラー
```bash
# Redis起動確認
docker ps | grep redis
# 再起動
docker compose up -d redis
```

### SQLiteエラー
```bash
# ファイル権限確認
ls -la data/aod.db
# 削除して再作成
rm data/aod.db && bun run dev
```
