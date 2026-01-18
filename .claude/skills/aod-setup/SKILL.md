---
name: aod-setup
description: |
  このスキルはAI Orchestration Dashboardの構築に関する質問に対応します。以下の場合に使用:
  (1) ダッシュボードのセットアップや設定について質問
  (2) Backend/Frontend構築について質問
  (3) Hooks統合について質問
  (4) WebSocket通信について質問
  (5) Redis/SQLite設定について質問
version: 1.0.0
---

# AOD Setup Skill

AI Orchestration Dashboard (AOD) の構築に関する知識とベストプラクティスを提供します。

## 関連コマンド

- `/setup-dashboard` - 自動セットアップ実行
- `/setup-dashboard --verify-only` - 現在の環境検証
- `/setup-dashboard --phase=<phase>` - 特定フェーズのみ実行

## システム構成

```
AI Orchestration Dashboard
├── Frontend (Next.js 14)
│   ├── Dashboard UI
│   ├── WebSocket Client
│   └── Zustand State
├── Backend (Bun + Hono)
│   ├── REST API
│   ├── WebSocket Server
│   ├── Redis Adapter
│   └── SQLite Adapter
└── Infrastructure
    ├── Redis (MCP状態)
    └── SQLite (イベント保存)
```

## 技術スタック

| コンポーネント | 技術 | バージョン |
|---------------|------|-----------|
| Frontend Framework | Next.js | 14.x |
| UI Components | shadcn/ui | latest |
| State Management | Zustand | 4.x |
| Backend Runtime | Bun | 1.x |
| Backend Framework | Hono | 4.x |
| Database (Events) | SQLite | WAL mode |
| Cache (State) | Redis | 7.x |
| Container | Docker Compose | v2.x |

## ポート割り当て

| サービス | ポート | 用途 |
|---------|-------|------|
| Dashboard | 3000 | Web UI |
| API Gateway | 4000 | REST API + WebSocket |
| Redis | 6379 | MCP Server状態 |

## ベストプラクティス

### WebSocket

1. **自動再接続**: 切断後5秒で再接続
2. **ハートビート**: 30秒間隔でping/pong
3. **バッファリング**: 大量イベント時のスロットリング

### イベント処理

1. **非同期保存**: イベントはキューイングして非同期保存
2. **バッチ処理**: 複数イベントをまとめてInsert
3. **TTL**: 古いイベントは自動削除（30日）

### エージェント状態

1. **ポーリング**: 5秒間隔でRedisから取得
2. **キャッシュ**: クライアント側で状態キャッシュ
3. **差分更新**: 変更があった場合のみUI更新

## ディレクトリ構造

```
ai-orchestration-dashboard/
├── docker-compose.yml
├── .env.example
├── README.md
├── docs/
│   ├── PRJ-2026-002_企画書.md
│   ├── REQ-2026-002_要件定義書.md
│   └── DES-2026-002_設計書.md
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── lib/
│   │   └── types/
│   └── package.json
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── adapters/
│   │   ├── websocket/
│   │   └── middleware/
│   ├── db/
│   └── package.json
├── hooks/
│   ├── send_event.py
│   └── settings.json.example
├── scripts/
│   ├── start.sh
│   ├── stop.sh
│   └── reset.sh
├── data/
│   └── .gitkeep
└── .claude/
    ├── commands/
    ├── agents/
    └── skills/
```

## 関連エージェント

| エージェント | 用途 |
|-------------|------|
| infrastructure-setup | Docker, Redis, SQLite構築 |
| backend-setup | Bun + Hono API構築 |
| frontend-setup | Next.js Dashboard構築 |
| hooks-setup | Claude Code Hooks統合 |
| dashboard-verifier | 環境検証 |
| dashboard-conductor | オーケストレーション |

## よくある質問

### ダッシュボードが表示されない

1. Backendが起動しているか確認
   ```bash
   curl http://localhost:4000/health
   ```

2. CORSエラーの確認（ブラウザコンソール）

3. 環境変数の確認
   ```bash
   cat frontend/.env.local
   ```

### WebSocketが接続できない

1. Backend WebSocketログ確認
2. ブラウザでws://localhost:4000/wsに接続テスト
3. ファイアウォール設定確認

### イベントが表示されない

1. Hooksスクリプト実行権限
   ```bash
   chmod +x hooks/send_event.py
   ```

2. 手動イベント送信テスト
   ```bash
   echo '{}' | python hooks/send_event.py TestEvent
   curl http://localhost:4000/api/events?limit=1
   ```

3. SQLiteテーブル確認
   ```bash
   sqlite3 data/aod.db "SELECT COUNT(*) FROM events"
   ```

### Redis接続エラー

1. Redisコンテナ確認
   ```bash
   docker ps | grep redis
   ```

2. 接続テスト
   ```bash
   docker exec aod-redis redis-cli ping
   ```

3. 再起動
   ```bash
   docker compose restart redis
   ```

## 参考リンク

- [Next.js App Router](https://nextjs.org/docs/app)
- [Hono](https://hono.dev/)
- [Bun](https://bun.sh/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Claude Code Hooks](https://docs.anthropic.com/claude-code/hooks)
