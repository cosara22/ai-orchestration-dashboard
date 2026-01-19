---
name: task-queue
description: |
  タスクキュー管理スキル。マルチエージェント環境でのタスク管理に使用:
  (1) タスクをキューに追加
  (2) タスクの優先度変更
  (3) タスクの割り当て状況確認
  (4) 自分に割り当てられたタスクの取得
  (5) タスクの完了/失敗報告
  重要: 並列開発時はこのスキルでタスク管理を行うこと
user_invocable: true
version: 1.0.0
---

# Task Queue Skill

マルチエージェント並列開発におけるタスクキュー管理を行います。

## 使用方法

```
/task-queue [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `list` | キュー内タスク一覧 | `/task-queue list` |
| `add` | タスクをキューに追加 | `/task-queue add --task=xxx` |
| `next` | 次の割り当て候補取得 | `/task-queue next` |
| `claim` | タスクを自分に割り当て | `/task-queue claim --id=xxx` |
| `start` | タスク開始を報告 | `/task-queue start --id=xxx` |
| `complete` | タスク完了を報告 | `/task-queue complete --id=xxx` |
| `fail` | タスク失敗を報告 | `/task-queue fail --id=xxx` |
| `status` | キュー統計情報 | `/task-queue status` |

## タスク優先度

| 優先度 | 値 | 説明 |
|--------|-----|------|
| P0 | 0 | 最高優先度（即時対応） |
| P1 | 1 | 高優先度（通常タスク） |
| P2 | 2 | 低優先度（バックログ） |

## タスク状態

```
pending → assigned → in_progress → completed
                  ↘              ↗
                    → failed → (retry) →
                              ↘
                                → blocked
```

| 状態 | 説明 |
|------|------|
| `pending` | キュー待機中（未割り当て） |
| `assigned` | エージェントに割り当て済み |
| `in_progress` | 作業中 |
| `completed` | 完了 |
| `failed` | 失敗（リトライ可能） |
| `blocked` | ブロック中（依存待ち等） |

## API エンドポイント

### POST /api/queue/enqueue

タスクをキューに追加します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "task_id": "required - 既存タスクID",
  "priority": "optional - 0,1,2 (default: 1)",
  "required_capabilities": ["optional - 必要スキル配列"],
  "timeout_minutes": "optional - タイムアウト分 (default: 60)",
  "metadata": "optional - 追加情報（JSON）"
}
```

**Response**:
```json
{
  "queue_id": "q_xxx",
  "position": 5,
  "estimated_wait_minutes": 15
}
```

### GET /api/queue/list

キュー内タスク一覧を取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `status` - ステータスフィルタ（optional）
- `priority` - 優先度フィルタ（optional）
- `assigned_to` - 割り当てエージェント（optional）
- `limit` - 取得件数（default: 50）

**Response**:
```json
{
  "tasks": [
    {
      "queue_id": "q_xxx",
      "task_id": "task_xxx",
      "task_title": "認証API実装",
      "priority": 0,
      "required_capabilities": ["backend", "authentication"],
      "status": "pending",
      "enqueued_at": "2026-01-19T10:00:00Z",
      "assigned_agent_id": null
    }
  ],
  "total": 10,
  "pending": 5,
  "in_progress": 3,
  "completed": 2
}
```

### GET /api/queue/next

次に割り当てるべきタスクを取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `agent_id` - エージェントID（自動マッチング用）

**Response**:
```json
{
  "task": {
    "queue_id": "q_xxx",
    "task_id": "task_xxx",
    "task_title": "認証API実装",
    "priority": 0,
    "required_capabilities": ["backend"],
    "match_score": 95
  },
  "alternatives": [...]
}
```

### POST /api/queue/:id/assign

タスクをエージェントに割り当てます。

**Request Body**:
```json
{
  "agent_id": "required - エージェントID"
}
```

**Response**:
```json
{
  "success": true,
  "queue_id": "q_xxx",
  "assigned_at": "2026-01-19T10:05:00Z"
}
```

### POST /api/queue/:id/start

タスク開始を報告します。

**Request Body**:
```json
{
  "agent_id": "required - エージェントID"
}
```

### POST /api/queue/:id/complete

タスク完了を報告します。

**Request Body**:
```json
{
  "agent_id": "required - エージェントID",
  "result": "optional - 結果サマリー",
  "artifacts": ["optional - 成果物リスト"]
}
```

### POST /api/queue/:id/fail

タスク失敗を報告します。

**Request Body**:
```json
{
  "agent_id": "required - エージェントID",
  "reason": "required - 失敗理由",
  "retry": "optional - リトライするか (default: true)"
}
```

### GET /api/queue/stats

キュー統計情報を取得します。

**Response**:
```json
{
  "project_id": "proj_xxx",
  "total_tasks": 50,
  "by_status": {
    "pending": 20,
    "assigned": 5,
    "in_progress": 10,
    "completed": 12,
    "failed": 2,
    "blocked": 1
  },
  "by_priority": {
    "P0": 5,
    "P1": 30,
    "P2": 15
  },
  "average_wait_time_minutes": 8,
  "average_completion_time_minutes": 45
}
```

## 使用例

### タスクをキューに追加

```bash
/task-queue add --task=task_123 --priority=0 --capabilities=backend,api
```

実行内容:
1. task_123をP0（最高優先度）でキューに追加
2. 必要スキル: backend, api
3. キュー位置と推定待機時間を返却

### 次のタスクを取得して作業開始

```bash
/task-queue next
/task-queue claim --id=q_xxx
/task-queue start --id=q_xxx
```

実行内容:
1. 自分のスキルにマッチする次のタスクを取得
2. タスクを自分に割り当て
3. 作業開始を報告

### タスク完了報告

```bash
/task-queue complete --id=q_xxx --result="JWT認証を実装完了"
```

## 自動割り当てアルゴリズム

タスクの自動割り当ては以下の要素で決定されます：

1. **優先度スコア**: P0 > P1 > P2
2. **待機時間ボーナス**: 長く待っているタスクを優先
3. **依存関係**: 依存タスク完了済みのものを優先
4. **能力マッチング**: エージェントスキルとの適合度

```
priority_score = priority * 1000
               + wait_time_minutes
               + (dependencies_completed ? 100 : 0)
               + capability_match_score
```

## タイムアウト & リトライ

- **デフォルトタイムアウト**: 60分
- **最大リトライ回数**: 3回
- **リトライ間隔**: 指数バックオフ（1分, 2分, 4分）

タイムアウト発生時:
1. タスクを`failed`状態に変更
2. `retry_count`をインクリメント
3. `max_retries`未満なら再キューイング
4. WebSocketで通知

## WebSocket通知

タスクキューの変更は以下のイベントでリアルタイム通知されます：

| イベント | 発生タイミング |
|---------|---------------|
| `task:enqueued` | タスクがキューに追加 |
| `task:assigned` | タスクが割り当て |
| `task:started` | タスクが開始 |
| `task:completed` | タスクが完了 |
| `task:failed` | タスクが失敗 |
| `task:timeout` | タスクがタイムアウト |

## 関連スキル

- `/agent-capability` - エージェント能力管理
- `/file-lock` - ファイルロック管理
- `/conductor` - コンダクター統括
- `/shared-context` - 共有コンテキスト

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
