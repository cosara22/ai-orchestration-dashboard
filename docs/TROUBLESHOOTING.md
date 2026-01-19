# トラブルシューティングガイド

よくある問題と解決方法。

---

## 目次

1. [サービス起動の問題](#サービス起動の問題)
2. [エージェントの問題](#エージェントの問題)
3. [ファイルロックの問題](#ファイルロックの問題)
4. [通信・接続の問題](#通信接続の問題)
5. [パフォーマンスの問題](#パフォーマンスの問題)

---

## サービス起動の問題

### Docker Composeが起動しない

**症状:** `docker compose up` でエラー

**確認:**
```bash
# Dockerが動作しているか
docker ps

# ポートが使用中でないか
netstat -an | grep -E ":(4000|3002|6379)"
```

**解決:**
```bash
# 既存コンテナを削除
docker compose down -v

# 再起動
docker compose up -d
```

### ポートが既に使用中

**症状:** `Error: listen EADDRINUSE: address already in use`

**確認:**
```bash
# 使用中のプロセスを確認 (Windows)
netstat -ano | findstr :4000

# 使用中のプロセスを確認 (Linux/Mac)
lsof -i :4000
```

**解決:**
```bash
# プロセスを終了 (Windows)
taskkill /PID <PID> /F

# プロセスを終了 (Linux/Mac)
kill -9 <PID>
```

### Redisに接続できない

**症状:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**確認:**
```bash
# Redisが動作しているか
docker ps | grep redis
redis-cli ping
```

**解決:**
```bash
# Redisを起動
docker compose up -d redis

# または直接起動
docker run -d -p 6379:6379 redis:7-alpine
```

---

## エージェントの問題

### エージェントがダッシュボードに表示されない

**症状:** エージェントを起動したがMonitoringに表示されない

**確認:**
```bash
# 環境変数を確認
echo $AOD_AGENT_ID
echo $AOD_API_URL

# APIで直接確認
curl http://localhost:4000/api/agents
```

**解決:**
```bash
# 環境変数を正しく設定
export AOD_AGENT_ID="my-agent-001"
export AOD_AGENT_NAME="My Agent"
export AOD_PROJECT_ID="my-project"
export AOD_API_URL="http://localhost:4000"

# エージェントを手動登録
curl -X POST http://localhost:4000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"my-agent-001","name":"My Agent","type":"worker"}'
```

### Hooksが動作しない

**症状:** イベントがダッシュボードに送信されない

**確認:**
```bash
# Pythonが動作するか
python --version

# Hooksスクリプトを直接テスト
echo '{"test":"data"}' | python .claude/hooks/send_event.py PostToolUse
```

**解決:**
```bash
# settings.jsonのパスを確認
cat .claude/settings.json

# 権限を確認 (Linux/Mac)
chmod +x .claude/hooks/send_event.py
```

### エージェントがタスクを取得できない

**症状:** `/task-queue my-tasks` が空

**確認:**
```bash
# タスクが存在するか
curl "http://localhost:4000/api/queue/tasks?project_id=my-project"

# エージェントの能力を確認
curl http://localhost:4000/api/agents/my-agent-001
```

**解決:**
```bash
# 能力を登録
curl -X POST http://localhost:4000/api/agents/my-agent-001/capabilities \
  -H "Content-Type: application/json" \
  -d '{"capabilities":[{"tag":"typescript","proficiency":80}]}'

# タスクを直接割り当て
curl -X POST http://localhost:4000/api/queue/tasks/xxx/assign \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"my-agent-001"}'
```

---

## ファイルロックの問題

### ロックを取得できない

**症状:** `Lock already held by another agent`

**確認:**
```bash
# 現在のロックを確認
curl "http://localhost:4000/api/locks?project_id=my-project"

# 誰がロックしているか
curl http://localhost:4000/api/locks/check \
  -H "Content-Type: application/json" \
  -d '{"project_id":"my-project","file_path":"src/xxx.ts"}'
```

**解決:**
```bash
# ロック所有者に連絡 (shared-contextで)
# または期限切れを待つ

# 緊急時: 強制解放 (管理者のみ)
curl -X POST http://localhost:4000/api/locks/force-release \
  -H "Content-Type: application/json" \
  -d '{"lock_id":"xxx","reason":"Emergency release"}'
```

### 期限切れロックが残っている

**症状:** 誰も使っていないのにロックが存在

**解決:**
```bash
# クリーンアップ実行
curl -X POST http://localhost:4000/api/locks/cleanup

# 結果確認
curl "http://localhost:4000/api/locks?project_id=my-project"
```

### ロック競合が頻発

**症状:** 複数エージェントが同じファイルを編集しようとする

**解決:**
1. タスク設計を見直す - ファイルごとにタスク分割
2. ファイル分割 - 大きなファイルを分割
3. 作業時間帯を分ける

---

## 通信・接続の問題

### WebSocketが切断される

**症状:** ダッシュボードで「Disconnected」表示

**確認:**
```bash
# WebSocketエンドポイントを確認
curl http://localhost:4000/health
```

**解決:**
```bash
# バックエンドを再起動
docker compose restart backend

# ブラウザをリロード
```

### APIレスポンスが遅い

**症状:** API呼び出しに数秒かかる

**確認:**
```bash
# レスポンス時間を計測
time curl http://localhost:4000/api/agents

# DBサイズを確認
ls -lh data/aod.db
```

**解決:**
```bash
# DBをVACUUM
sqlite3 data/aod.db "VACUUM;"

# 古いデータを削除
curl -X DELETE "http://localhost:4000/api/events?older_than=7d"
```

### CORSエラー

**症状:** ブラウザコンソールにCORSエラー

**確認:**
```bash
# レスポンスヘッダーを確認
curl -I http://localhost:4000/api/health
```

**解決:**
バックエンドの設定を確認。Honoのcorsミドルウェアが正しく設定されているか確認。

---

## パフォーマンスの問題

### メモリ使用量が高い

**症状:** コンテナのメモリ使用量が増加し続ける

**確認:**
```bash
# コンテナのリソース使用状況
docker stats
```

**解決:**
```bash
# コンテナを再起動
docker compose restart

# メモリ制限を設定 (docker-compose.yml)
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
```

### タスク処理が遅い

**症状:** タスクがキューに溜まる

**確認:**
```bash
# 待機中タスク数
curl http://localhost:4000/api/queue/tasks?status=pending | jq '.total'

# アクティブエージェント数
curl http://localhost:4000/api/agents | jq '[.agents[] | select(.status=="active")] | length'
```

**解決:**
1. エージェントを追加
2. タスクの優先度を調整
3. ボトルネックを特定 (`/conductor bottlenecks`)

### ダッシュボードが重い

**症状:** UIの反応が遅い

**解決:**
1. ブラウザの開発者ツールでパフォーマンスを確認
2. 表示データ量を制限 (フィルター使用)
3. 自動更新間隔を長くする (30秒→60秒)

---

## ログの確認方法

### バックエンドログ

```bash
# Docker
docker logs aod-backend -f

# ローカル
cd server && bun run dev
```

### フロントエンドログ

```bash
# Docker
docker logs aod-frontend -f

# ブラウザ
開発者ツール → Console
```

### Redisログ

```bash
docker logs aod-redis -f
```

---

## サポート

問題が解決しない場合:

1. **GitHub Issues**: https://github.com/your-repo/issues
2. **ログを添付**: 関連するログを収集
3. **再現手順**: 問題を再現する手順を明記
