---
name: dashboard-verifier
description: |
  AOD構築の各フェーズ完了後に検証を実行。以下の場合に使用:
  (1) 構築の受入基準を確認する
  (2) 特定フェーズの検証を行う
  (3) 全体のシステム状態をチェックする
model: sonnet
---

# Dashboard Verifier Agent

AI Orchestration Dashboardの検証を実行します。

## 呼び出し方法

引数で検証対象フェーズを指定:
- `--phase=infrastructure` - NFR-014検証
- `--phase=backend` - FR-001〜003 Backend検証
- `--phase=frontend` - FR-001〜003 Frontend検証
- `--phase=hooks` - IF-001検証
- `--phase=websocket` - WebSocket検証
- `--phase=all` - 全フェーズ検証

## 検証チェックリスト

### NFR-014: Infrastructure検証

| チェック項目 | コマンド | 期待結果 |
|-------------|---------|---------|
| Docker起動 | `docker info` | 正常出力 |
| Redis接続 | `docker exec redis redis-cli ping` | PONG |
| SQLiteファイル | `ls data/aod.db` | ファイル存在 |

**検証スクリプト:**
```bash
echo "=== NFR-014: Infrastructure Verification ==="
errors=0

# Docker check
if docker info >/dev/null 2>&1; then
    echo "[PASS] Docker is running"
else
    echo "[FAIL] Docker is not running"
    ((errors++))
fi

# Redis check
if docker exec aod-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo "[PASS] Redis is responding"
else
    echo "[FAIL] Redis is not responding"
    ((errors++))
fi

# SQLite check
if [ -f "data/aod.db" ]; then
    echo "[PASS] SQLite database exists"
else
    echo "[FAIL] SQLite database not found"
    ((errors++))
fi

echo "NFR-014 Errors: $errors"
```

### FR-001〜003: Backend検証

| チェック項目 | コマンド | 期待結果 |
|-------------|---------|---------|
| Health endpoint | `curl http://localhost:4000/health` | {"status":"healthy"} |
| Agents API | `curl http://localhost:4000/api/agents` | JSON配列 |
| Tasks API | `curl http://localhost:4000/api/tasks` | JSON配列 |
| Events API | `curl http://localhost:4000/api/events` | JSON配列 |

**検証スクリプト:**
```bash
echo "=== FR-001-003: Backend Verification ==="
errors=0

# Health check
health=$(curl -s http://localhost:4000/health)
if echo "$health" | grep -q "healthy"; then
    echo "[PASS] Health endpoint: $health"
else
    echo "[FAIL] Health endpoint failed"
    ((errors++))
fi

# Agents API
agents=$(curl -s http://localhost:4000/api/agents)
if echo "$agents" | grep -q "agents"; then
    echo "[PASS] Agents API responding"
else
    echo "[FAIL] Agents API failed"
    ((errors++))
fi

# Tasks API
tasks=$(curl -s http://localhost:4000/api/tasks)
if echo "$tasks" | grep -q "tasks"; then
    echo "[PASS] Tasks API responding"
else
    echo "[FAIL] Tasks API failed"
    ((errors++))
fi

# Events API
events=$(curl -s http://localhost:4000/api/events)
if echo "$events" | grep -q "events"; then
    echo "[PASS] Events API responding"
else
    echo "[FAIL] Events API failed"
    ((errors++))
fi

echo "FR-001-003 Backend Errors: $errors"
```

### FR-001〜003: Frontend検証

| チェック項目 | コマンド | 期待結果 |
|-------------|---------|---------|
| ダッシュボードアクセス | `curl -I http://localhost:3000` | 200 OK |
| 静的アセット | `curl -I http://localhost:3000/_next/static/` | 200 OK |

**検証スクリプト:**
```bash
echo "=== FR-001-003: Frontend Verification ==="
errors=0

# Dashboard access
status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
if [ "$status" = "200" ]; then
    echo "[PASS] Dashboard accessible (HTTP $status)"
else
    echo "[FAIL] Dashboard not accessible (HTTP $status)"
    ((errors++))
fi

echo "FR-001-003 Frontend Errors: $errors"
```

### IF-001: Hooks検証

| チェック項目 | コマンド | 期待結果 |
|-------------|---------|---------|
| イベント受信 | `curl -X POST -H "Content-Type: application/json" -d '{"source_app":"test","session_id":"test-123","hook_event_type":"TestEvent","payload":{}}' http://localhost:4000/api/events` | {"id":..., "received":true} |
| send_event.py存在 | `ls hooks/send_event.py` | ファイル存在 |

**検証スクリプト:**
```bash
echo "=== IF-001: Hooks Verification ==="
errors=0

# Event POST
response=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"source_app":"test","session_id":"test-123","hook_event_type":"TestEvent","payload":{}}' \
  http://localhost:4000/api/events)
if echo "$response" | grep -q "received"; then
    echo "[PASS] Event POST accepted"
else
    echo "[FAIL] Event POST failed"
    ((errors++))
fi

# send_event.py
if [ -f "hooks/send_event.py" ]; then
    echo "[PASS] send_event.py exists"
else
    echo "[FAIL] send_event.py not found"
    ((errors++))
fi

echo "IF-001 Errors: $errors"
```

### WebSocket検証

| チェック項目 | コマンド | 期待結果 |
|-------------|---------|---------|
| WebSocket接続 | wscat -c ws://localhost:4000/ws | 接続成功 |

**検証スクリプト:**
```bash
echo "=== WebSocket Verification ==="
errors=0

# WebSocket (requires wscat or websocat)
if command -v websocat &> /dev/null; then
    if echo '{"type":"ping"}' | timeout 5 websocat ws://localhost:4000/ws 2>/dev/null | grep -q "pong"; then
        echo "[PASS] WebSocket responding"
    else
        echo "[FAIL] WebSocket not responding"
        ((errors++))
    fi
else
    echo "[SKIP] websocat not installed"
fi

echo "WebSocket Errors: $errors"
```

## レポート形式

```
============================================
 AOD Verification Report
============================================
 Date: 2026-01-18 15:00:00
 Phase: all
============================================

NFR-014: Infrastructure
  [PASS] Docker is running
  [PASS] Redis is responding
  [PASS] SQLite database exists
  Status: PASS (3/3)

FR-001-003: Backend
  [PASS] Health endpoint
  [PASS] Agents API
  [PASS] Tasks API
  [PASS] Events API
  Status: PASS (4/4)

FR-001-003: Frontend
  [PASS] Dashboard accessible
  Status: PASS (1/1)

IF-001: Hooks
  [PASS] Event POST accepted
  [PASS] send_event.py exists
  Status: PASS (2/2)

WebSocket
  [PASS] WebSocket responding
  Status: PASS (1/1)

============================================
 SUMMARY
============================================
 Total Checks: 11
 Passed: 11
 Failed: 0

 Overall Status: PASS
============================================
```

## 実行例

### 全フェーズ検証
```
dashboard-verifier --phase=all
```

### 特定フェーズのみ
```
dashboard-verifier --phase=backend
```

### 複数フェーズ
```
dashboard-verifier --phase=infrastructure,backend
```

## エラー時の対応

検証失敗時は、対応するセットアップエージェントの
「トラブルシューティング」セクションを参照してください。

- Infrastructure失敗 → infrastructure-setup.md
- Backend失敗 → backend-setup.md
- Frontend失敗 → frontend-setup.md
- Hooks失敗 → hooks-setup.md
