---
name: infrastructure-setup
description: |
  AODインフラストラクチャのセットアップ。以下の場合に使用:
  (1) Docker Compose環境の構築
  (2) Redis, SQLiteのセットアップ
  (3) 共有サービスの起動
model: sonnet
---

# Infrastructure Setup Agent

Docker環境とデータストアのセットアップを実行します。

## 構成要素

| サービス | ポート | 用途 |
|---------|-------|------|
| Redis | 6379 | MCP Server状態管理 |
| SQLite | - | イベント・メトリクス保存 |

## セットアップ手順

### Step 1: Docker Compose作成

```yaml
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: aod-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis_data:
```

### Step 2: データディレクトリ作成

```bash
mkdir -p data
touch data/.gitkeep
```

### Step 3: .gitignore設定

```gitignore
# データ
data/*.db
data/*.db-journal
data/*.db-wal
!data/.gitkeep

# Docker
docker-compose.override.yml
```

### Step 4: サービス起動

```bash
# 起動
docker compose up -d

# ログ確認
docker compose logs -f redis

# 状態確認
docker compose ps
```

### Step 5: SQLiteスキーマ初期化

```bash
# スキーマファイル作成
mkdir -p server/db

cat > server/db/schema.sql << 'EOF'
-- イベントテーブル
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

-- メトリクステーブル
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    dimensions TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);

-- プロジェクトテーブル
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
EOF
```

### Step 6: 初期化スクリプト

```bash
# scripts/init-db.sh
#!/bin/bash
set -e

DB_PATH="${DB_PATH:-data/aod.db}"

# スキーマ適用
sqlite3 "$DB_PATH" < server/db/schema.sql

echo "Database initialized at $DB_PATH"
```

## 検証コマンド

### Docker確認
```bash
# コンテナ状態
docker compose ps

# Redis接続テスト
docker exec aod-redis redis-cli ping
# 期待: PONG

# Redis情報
docker exec aod-redis redis-cli info server
```

### SQLite確認
```bash
# データベース確認
sqlite3 data/aod.db ".tables"
# 期待: events  metrics  projects

# スキーマ確認
sqlite3 data/aod.db ".schema events"
```

## 便利なスクリプト

### scripts/start.sh
```bash
#!/bin/bash
set -e

echo "Starting AOD services..."

# Docker services
docker compose up -d

# Wait for Redis
until docker exec aod-redis redis-cli ping | grep -q PONG; do
    echo "Waiting for Redis..."
    sleep 1
done

echo "Redis is ready"

# Initialize database if not exists
if [ ! -f "data/aod.db" ]; then
    ./scripts/init-db.sh
fi

echo "All services started"
```

### scripts/stop.sh
```bash
#!/bin/bash
echo "Stopping AOD services..."
docker compose down
echo "Services stopped"
```

### scripts/reset.sh
```bash
#!/bin/bash
echo "Resetting AOD data..."
docker compose down -v
rm -f data/aod.db
echo "Data reset complete"
```

## トラブルシューティング

### Docker起動エラー
```bash
# Docker Desktop確認
docker info

# ポート競合確認
lsof -i :6379
# または Windows
netstat -ano | findstr :6379

# コンテナログ
docker compose logs redis
```

### Redis接続エラー
```bash
# 再起動
docker compose restart redis

# 完全リセット
docker compose down -v
docker compose up -d
```

### SQLiteエラー
```bash
# ファイル権限
chmod 644 data/aod.db

# 破損時は再作成
rm data/aod.db
./scripts/init-db.sh
```

### ディスク容量
```bash
# Dockerディスク使用量
docker system df

# クリーンアップ
docker system prune -f
```
