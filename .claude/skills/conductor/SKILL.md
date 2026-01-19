---
name: conductor
description: |
  コンダクターエージェント統括スキル。マルチエージェント環境でのオーケストレーションに使用:
  (1) プロジェクト全体状況の把握
  (2) タスクの分解と割り当て
  (3) ボトルネック検出と対応
  (4) リソースの再配置
  (5) エスカレーションと人間介入
  重要: 統括者はこのスキルで全体管理を行う
user_invocable: true
version: 1.0.0
---

# Conductor Skill

マルチエージェント並列開発における全体統括・オーケストレーションを行います。

## 使用方法

```
/conductor [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `status` | プロジェクト全体状況 | `/conductor status` |
| `decompose` | タスク分解 | `/conductor decompose --task="認証システム"` |
| `reallocate` | リソース再配置 | `/conductor reallocate --from=agent1 --to=agent2` |
| `escalate` | エスカレーション | `/conductor escalate --issue="API遅延"` |
| `intervene` | 人間介入リクエスト | `/conductor intervene --urgency=high` |
| `decisions` | 意思決定ログ | `/conductor decisions` |
| `override` | 手動オーバーライド | `/conductor override --task=xxx --action=reassign` |

## コンダクターの役割

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Conductor Agent                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 監視 (Monitor)                                                  │
│     - 全エージェントの状態監視                                       │
│     - 進捗追跡                                                      │
│     - ボトルネック検出                                              │
│                                                                     │
│  2. 調整 (Coordinate)                                               │
│     - タスク分解・割り当て                                          │
│     - リソース最適化                                                │
│     - 依存関係管理                                                  │
│                                                                     │
│  3. 対応 (Respond)                                                  │
│     - 問題への自動対応                                              │
│     - エスカレーション                                              │
│     - 人間介入リクエスト                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API エンドポイント

### GET /api/conductor/status/:project_id

プロジェクト全体の状況を取得します。

**Response**:
```json
{
  "project_id": "proj_xxx",
  "project_name": "AI Dashboard",
  "overall_progress": 65,
  "health": "good",
  "active_agents": [
    {
      "agent_id": "agent_xxx",
      "agent_name": "Backend Agent",
      "status": "working",
      "current_task": "JWT認証実装",
      "task_progress": 80,
      "workload": 2,
      "last_activity": "2026-01-19T10:00:00Z"
    },
    {
      "agent_id": "agent_yyy",
      "agent_name": "Frontend Agent",
      "status": "idle",
      "current_task": null,
      "workload": 0,
      "last_activity": "2026-01-19T09:45:00Z"
    }
  ],
  "queued_tasks": 8,
  "in_progress_tasks": 3,
  "blocked_tasks": [
    {
      "task_id": "task_xxx",
      "title": "ユーザー管理UI",
      "blocked_by": "認証API完了待ち",
      "blocked_since": "2026-01-19T09:30:00Z"
    }
  ],
  "bottlenecks": [
    {
      "type": "resource",
      "description": "バックエンドエージェントが過負荷",
      "affected_tasks": ["task_aaa", "task_bbb"],
      "severity": "medium",
      "suggested_action": "タスクをFullstackエージェントに再配置"
    }
  ],
  "estimated_completion": "2026-01-20T18:00:00Z",
  "risks": [
    {
      "type": "delay",
      "probability": "medium",
      "impact": "1日遅延の可能性",
      "mitigation": "認証タスクの優先度を上げる"
    }
  ]
}
```

### POST /api/conductor/decompose

高レベルタスクをサブタスクに分解します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "high_level_task": "required - 分解対象タスク",
  "context": "optional - 追加コンテキスト",
  "max_subtasks": "optional - 最大サブタスク数 (default: 10)",
  "auto_assign": "optional - 自動割り当て (default: false)"
}
```

**Response**:
```json
{
  "original_task": "認証システムの実装",
  "subtasks": [
    {
      "task_id": "task_001",
      "title": "JWTトークン生成・検証ロジック",
      "description": "JWT形式のアクセストークンを生成・検証する機能",
      "required_capabilities": ["backend", "authentication", "typescript"],
      "estimated_hours": 4,
      "priority": 0,
      "dependencies": [],
      "suggested_agent": "Backend Agent"
    },
    {
      "task_id": "task_002",
      "title": "認証ミドルウェア実装",
      "description": "リクエスト認証を行うミドルウェア",
      "required_capabilities": ["backend", "hono"],
      "estimated_hours": 2,
      "priority": 1,
      "dependencies": ["task_001"],
      "suggested_agent": "Backend Agent"
    },
    {
      "task_id": "task_003",
      "title": "ログインUI実装",
      "description": "ログインフォームとエラー表示",
      "required_capabilities": ["frontend", "react"],
      "estimated_hours": 3,
      "priority": 1,
      "dependencies": [],
      "suggested_agent": "Frontend Agent"
    }
  ],
  "dependency_graph": {
    "task_001": [],
    "task_002": ["task_001"],
    "task_003": []
  },
  "critical_path": ["task_001", "task_002"],
  "total_estimated_hours": 9
}
```

### POST /api/conductor/reallocate

タスクを別のエージェントに再配置します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "task_ids": ["required - 再配置するタスクID配列"],
  "from_agent_id": "required - 現在のエージェント",
  "to_agent_id": "required - 移動先エージェント",
  "reason": "required - 再配置理由"
}
```

**Response**:
```json
{
  "success": true,
  "reallocated_tasks": [
    {
      "task_id": "task_xxx",
      "from_agent": "Backend Agent",
      "to_agent": "Fullstack Agent",
      "status": "assigned"
    }
  ],
  "decision_id": "dec_xxx"
}
```

### POST /api/conductor/escalate

問題をエスカレーションします。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "issue_type": "required - blocker/conflict/delay/quality",
  "description": "required - 問題の説明",
  "affected_tasks": ["optional - 影響を受けるタスク"],
  "affected_agents": ["optional - 影響を受けるエージェント"],
  "severity": "optional - low/medium/high/critical (default: medium)",
  "suggested_actions": ["optional - 提案するアクション"]
}
```

**Response**:
```json
{
  "escalation_id": "esc_xxx",
  "status": "escalated",
  "notified_parties": ["human_operator", "conductor"],
  "auto_actions_taken": [
    {
      "action": "pause_dependent_tasks",
      "affected_tasks": ["task_yyy", "task_zzz"]
    }
  ],
  "next_review_at": "2026-01-19T11:00:00Z"
}
```

### POST /api/conductor/request-intervention

人間の介入をリクエストします。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "urgency": "required - low/medium/high/critical",
  "description": "required - 介入が必要な理由",
  "context": "optional - 状況説明",
  "options": [
    {
      "option_id": "opt_1",
      "label": "タスクAを優先",
      "description": "認証タスクを最優先で完了させる",
      "impact": "他のタスクが1日遅延"
    },
    {
      "option_id": "opt_2",
      "label": "追加リソース投入",
      "description": "新しいエージェントを追加",
      "impact": "コスト増加"
    }
  ],
  "deadline": "optional - 判断期限"
}
```

**Response**:
```json
{
  "intervention_id": "int_xxx",
  "status": "pending",
  "notification_sent": true,
  "notification_channels": ["dashboard", "webhook"],
  "expires_at": "2026-01-19T12:00:00Z"
}
```

### GET /api/conductor/decisions

意思決定ログを取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `decision_type` - タイプフィルタ（optional）
- `outcome` - 結果フィルタ（optional）
- `limit` - 取得件数（default: 50）

**Response**:
```json
{
  "decisions": [
    {
      "decision_id": "dec_xxx",
      "decision_type": "reallocation",
      "description": "過負荷解消のためタスク再配置",
      "affected_agents": ["agent_xxx", "agent_yyy"],
      "affected_tasks": ["task_aaa"],
      "rationale": "Backend Agentの負荷が80%を超過、Fullstack Agentは空き状態",
      "outcome": "success",
      "decided_at": "2026-01-19T10:00:00Z",
      "executed_at": "2026-01-19T10:00:05Z",
      "result_summary": "タスクは30分で完了、全体遅延なし"
    }
  ],
  "total": 25
}
```

### POST /api/conductor/override

コンダクターの決定を手動でオーバーライドします。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "target_type": "required - task/agent/decision",
  "target_id": "required - 対象ID",
  "action": "required - アクション",
  "parameters": "optional - アクションパラメータ",
  "reason": "required - オーバーライド理由"
}
```

## 使用例

### プロジェクト状況確認

```bash
/conductor status
```

実行内容:
1. 全エージェントの状態を取得
2. 進行中・待機中タスクを集計
3. ボトルネック・リスクを分析
4. ダッシュボードに表示

### タスク分解

```bash
/conductor decompose --task="ユーザー認証システムの実装"
```

実行内容:
1. タスクを分析し、サブタスクに分解
2. 各サブタスクの依存関係を特定
3. 必要スキルを自動判定
4. クリティカルパスを計算

### リソース再配置

```bash
/conductor reallocate --task=task_123 --from=backend_agent --to=fullstack_agent --reason="負荷分散"
```

### エスカレーション

```bash
/conductor escalate --type=blocker --description="外部API障害でタスクがブロック" --severity=high
```

## 監視ループ

コンダクターは30秒間隔で以下を監視します：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Monitor Loop (30秒間隔)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 進捗チェック                                                    │
│     - 各タスクの進捗率を確認                                        │
│     - 予定より遅れているタスクを検出                                │
│                                                                     │
│  2. エージェント状態チェック                                        │
│     - ハートビート確認（5分以上応答なし → 異常）                    │
│     - 負荷確認（80%超過 → 過負荷警告）                              │
│     - アイドル時間確認（10分以上 → タスク割り当て推奨）             │
│                                                                     │
│  3. ボトルネック検出                                                │
│     - リソースボトルネック（特定スキルのエージェント不足）          │
│     - 依存関係ボトルネック（完了待ちタスクの連鎖）                  │
│     - 競合ボトルネック（ファイルロック待ち）                        │
│                                                                     │
│  4. 自動対応                                                        │
│     - 軽微な問題 → 自動で対応（優先度調整、再割り当て）            │
│     - 中程度の問題 → エスカレーション候補としてマーク              │
│     - 深刻な問題 → 即座にエスカレーション                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 意思決定タイプ

| タイプ | 説明 | 自動/手動 |
|--------|------|---------|
| `assignment` | 新規タスクの割り当て | 自動 |
| `priority_change` | 優先度の変更 | 自動/手動 |
| `reallocation` | タスクの再配置 | 自動/手動 |
| `escalation` | エスカレーション | 自動 |
| `intervention` | 人間介入リクエスト | 自動 |
| `pause` | タスクの一時停止 | 自動/手動 |
| `resume` | タスクの再開 | 手動 |
| `cancel` | タスクのキャンセル | 手動 |

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `conductor:status_update` | ステータス更新（30秒間隔） |
| `conductor:bottleneck_detected` | ボトルネック検出 |
| `conductor:decision_made` | 意思決定実行 |
| `conductor:escalation` | エスカレーション発生 |
| `conductor:intervention_required` | 人間介入が必要 |
| `conductor:intervention_response` | 人間からの応答 |

## 関連スキル

- `/task-queue` - タスクキュー管理
- `/agent-capability` - エージェント能力管理
- `/file-lock` - ファイルロック管理
- `/shared-context` - 共有コンテキスト

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
| AOD_CONDUCTOR_INTERVAL | 監視間隔秒 | 30 |
| AOD_ESCALATION_WEBHOOK | エスカレーション通知URL | なし |
