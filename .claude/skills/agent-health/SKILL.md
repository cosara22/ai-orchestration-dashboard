---
name: agent-health
description: |
  エージェントヘルス監視スキル。マルチエージェント環境でのエージェント状態監視に使用:
  (1) ハートビート送信・監視
  (2) エージェント状態の確認
  (3) 異常検出とアラート
  (4) リソース使用状況の報告
  (5) 自動回復アクション
  重要: 全エージェントは定期的にハートビートを送信すること
user_invocable: true
version: 1.0.0
---

# Agent Health Skill

マルチエージェント並列開発におけるエージェントのヘルス監視を行います。

## 使用方法

```
/agent-health [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `heartbeat` | ハートビート送信 | `/agent-health heartbeat` |
| `status` | 自分の状態報告 | `/agent-health status --state=working` |
| `check` | 特定エージェント確認 | `/agent-health check --agent=agent_xxx` |
| `list` | 全エージェント一覧 | `/agent-health list` |
| `alert` | アラート送信 | `/agent-health alert --type=error` |
| `recover` | 回復アクション | `/agent-health recover --agent=agent_xxx` |
| `metrics` | ヘルスメトリクス | `/agent-health metrics` |

## エージェント状態

| 状態 | 説明 | ハートビート |
|------|------|-------------|
| `active` | 正常稼働中 | 必須（30秒間隔） |
| `working` | タスク作業中 | 必須 |
| `idle` | 待機中 | 必須 |
| `paused` | 一時停止中 | 必須 |
| `error` | エラー発生 | 可能なら送信 |
| `unresponsive` | 応答なし | 5分以上未受信 |
| `offline` | オフライン | 10分以上未受信 |

## ヘルス監視の仕組み

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Health Monitoring System                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  Heartbeat (30s)   ┌──────────────────────────┐  │
│  │ Backend      │ ─────────────────▶ │                          │  │
│  │ Agent        │                    │                          │  │
│  └──────────────┘                    │                          │  │
│                                      │   Health Monitor         │  │
│  ┌──────────────┐  Heartbeat (30s)   │   Service                │  │
│  │ Frontend     │ ─────────────────▶ │                          │  │
│  │ Agent        │                    │   - ハートビート受信     │  │
│  └──────────────┘                    │   - 状態追跡            │  │
│                                      │   - 異常検出            │  │
│  ┌──────────────┐  Heartbeat (30s)   │   - アラート発火        │  │
│  │ Test         │ ─────────────────▶ │                          │  │
│  │ Agent        │                    │                          │  │
│  └──────────────┘                    └───────────┬──────────────┘  │
│                                                  │                  │
│                                                  ▼                  │
│                                      ┌──────────────────────────┐  │
│                                      │   Conductor Agent        │  │
│                                      │   (異常時に通知)         │  │
│                                      └──────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API エンドポイント

### POST /api/health/heartbeat

ハートビートを送信します。

**Request Body**:
```json
{
  "agent_id": "required - エージェントID",
  "status": "required - active/working/idle/paused/error",
  "current_task_id": "optional - 作業中のタスクID",
  "progress": "optional - タスク進捗 (0-100)",
  "metrics": {
    "memory_usage_mb": "optional - メモリ使用量",
    "cpu_percent": "optional - CPU使用率",
    "active_connections": "optional - アクティブ接続数"
  },
  "message": "optional - 状態メッセージ"
}
```

**Response**:
```json
{
  "received": true,
  "agent_id": "agent_xxx",
  "timestamp": "2026-01-19T10:00:00Z",
  "next_expected": "2026-01-19T10:00:30Z",
  "server_messages": [
    {
      "type": "task_assignment",
      "task_id": "task_yyy",
      "message": "新しいタスクが割り当てられました"
    }
  ]
}
```

### GET /api/health/agents

全エージェントのヘルス状態を取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（optional）
- `status` - ステータスフィルタ（optional）

**Response**:
```json
{
  "agents": [
    {
      "agent_id": "agent_xxx",
      "agent_name": "Backend Agent",
      "status": "working",
      "health": "healthy",
      "current_task": {
        "task_id": "task_yyy",
        "title": "JWT認証実装",
        "progress": 75
      },
      "last_heartbeat": "2026-01-19T10:00:00Z",
      "uptime_minutes": 180,
      "metrics": {
        "memory_usage_mb": 512,
        "cpu_percent": 45,
        "tasks_completed_today": 5
      },
      "capabilities": ["backend", "authentication", "typescript"]
    }
  ],
  "summary": {
    "total": 3,
    "healthy": 2,
    "warning": 1,
    "critical": 0,
    "offline": 0
  }
}
```

### POST /api/health/alert

アラートを送信します。

**Request Body**:
```json
{
  "agent_id": "required - エージェントID",
  "alert_type": "required - error/warning/info",
  "title": "required - アラートタイトル",
  "description": "required - 詳細説明",
  "severity": "optional - low/medium/high/critical",
  "affected_tasks": ["optional - 影響を受けるタスク"],
  "suggested_action": "optional - 推奨アクション"
}
```

### POST /api/health/recover

回復アクションを実行します。

**Request Body**:
```json
{
  "agent_id": "required - 対象エージェントID",
  "action": "required - restart/reassign_tasks/force_release_locks",
  "reason": "required - 回復理由",
  "initiated_by": "required - 実行者"
}
```

**Response**:
```json
{
  "recovery_id": "rec_xxx",
  "agent_id": "agent_xxx",
  "action": "reassign_tasks",
  "status": "completed",
  "results": {
    "tasks_reassigned": ["task_yyy", "task_zzz"],
    "locks_released": ["src/auth/jwt.ts"],
    "branch_released": "feat/auth-api"
  }
}
```

## 使用例

### ハートビート送信

```bash
/agent-health heartbeat --status=working --task=task_123 --progress=50
```

### エラーアラート送信

```bash
/agent-health alert --type=error --title="API接続エラー" --severity=high
```

### 応答なしエージェントの回復

```bash
/agent-health recover --agent=agent_xxx --action=reassign_tasks
```

## 自動ハートビート（Hooks連携）

```json
{
  "hooks": {
    "Notification": [
      {
        "command": "python .claude/hooks/send_heartbeat.py",
        "timeout": 3000
      }
    ]
  }
}
```

## 異常検出と自動回復

| 異常タイプ | 検出条件 | 自動アクション |
|-----------|---------|---------------|
| `unresponsive` | 5分間ハートビートなし | アラート送信 |
| `offline` | 10分間ハートビートなし | タスク再割り当て |
| `error` | エラーアラート受信 | コンダクターに通知 |
| `stuck` | 30分間進捗なし | 確認通知 |
| `overloaded` | リソース使用率90%超 | 新規タスク割り当て停止 |

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `health:heartbeat` | ハートビート受信 |
| `health:status_changed` | 状態変更 |
| `health:alert` | アラート発生 |
| `health:unresponsive` | 応答なし検出 |
| `health:offline` | オフライン検出 |
| `health:recovered` | 回復完了 |

## 関連スキル

- `/conductor` - コンダクター統括
- `/task-queue` - タスクキュー管理
- `/shared-context` - 共有コンテキスト

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_HEARTBEAT_INTERVAL | ハートビート間隔秒 | 30 |
