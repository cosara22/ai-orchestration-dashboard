---
name: agent-capability
description: |
  エージェント能力管理スキル。マルチエージェント環境での能力・スキル管理に使用:
  (1) 自分の能力を登録・更新
  (2) 能力タグの確認
  (3) タスクと能力のマッチング確認
  (4) 推薦エージェントの取得
  (5) 能力の成功率確認
  重要: エージェント起動時に能力を登録すること
user_invocable: true
version: 1.0.0
---

# Agent Capability Skill

マルチエージェント並列開発におけるエージェント能力管理を行います。

## 使用方法

```
/agent-capability [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `list` | 能力タグ一覧 | `/agent-capability list` |
| `register` | 能力を登録 | `/agent-capability register --skills=backend,api` |
| `update` | 能力を更新 | `/agent-capability update --skill=backend --proficiency=5` |
| `my` | 自分の能力確認 | `/agent-capability my` |
| `match` | タスクとのマッチング | `/agent-capability match --task=xxx` |
| `recommend` | 推薦エージェント取得 | `/agent-capability recommend --task=xxx` |
| `stats` | 能力統計情報 | `/agent-capability stats` |

## 能力タグ階層

```
capabilities/
├── language/           # プログラミング言語
│   ├── typescript
│   ├── javascript
│   ├── python
│   ├── go
│   ├── rust
│   └── sql
├── framework/          # フレームワーク
│   ├── frontend/
│   │   ├── react
│   │   ├── nextjs
│   │   ├── vue
│   │   └── svelte
│   └── backend/
│       ├── hono
│       ├── express
│       ├── fastapi
│       └── django
├── domain/             # ドメイン知識
│   ├── api
│   ├── database
│   ├── authentication
│   ├── authorization
│   ├── testing
│   ├── performance
│   └── security
└── tool/               # ツール
    ├── git
    ├── docker
    ├── kubernetes
    ├── ci-cd
    └── monitoring
```

## 熟練度レベル

| レベル | 値 | 説明 |
|--------|-----|------|
| Novice | 1 | 基本的な知識あり |
| Beginner | 2 | 簡単なタスクを遂行可能 |
| Intermediate | 3 | 標準的なタスクを遂行可能 |
| Advanced | 4 | 複雑なタスクを遂行可能 |
| Expert | 5 | 高度な専門知識を持つ |

## API エンドポイント

### GET /api/capabilities/tags

能力タグ一覧を取得します。

**Query Parameters**:
- `category` - カテゴリフィルタ（optional）

**Response**:
```json
{
  "tags": [
    {
      "tag": "typescript",
      "category": "language",
      "description": "TypeScript言語",
      "parent_tag": null
    },
    {
      "tag": "react",
      "category": "framework",
      "description": "Reactフレームワーク",
      "parent_tag": "frontend"
    }
  ]
}
```

### POST /api/capabilities/tags

新しい能力タグを追加します。

**Request Body**:
```json
{
  "tag": "required - タグ名",
  "category": "required - language/framework/domain/tool",
  "description": "optional - 説明",
  "parent_tag": "optional - 親タグ"
}
```

### GET /api/capabilities/agent/:id

エージェントの能力を取得します。

**Response**:
```json
{
  "agent_id": "agent_xxx",
  "agent_name": "Backend Agent",
  "capabilities": [
    {
      "capability_id": "cap_xxx",
      "capability": "typescript",
      "proficiency": 5,
      "verified": true,
      "success_rate": 0.92,
      "last_used": "2026-01-19T10:00:00Z",
      "tasks_completed": 45
    },
    {
      "capability_id": "cap_yyy",
      "capability": "backend",
      "proficiency": 4,
      "verified": true,
      "success_rate": 0.88,
      "last_used": "2026-01-19T09:30:00Z",
      "tasks_completed": 32
    }
  ],
  "overall_success_rate": 0.90,
  "total_tasks_completed": 120
}
```

### POST /api/capabilities/agent/:id

エージェントに能力を追加します。

**Request Body**:
```json
{
  "capabilities": [
    {
      "capability": "required - 能力タグ",
      "proficiency": "optional - 1-5 (default: 3)"
    }
  ]
}
```

**Response**:
```json
{
  "added": ["typescript", "backend"],
  "skipped": [],
  "agent_id": "agent_xxx"
}
```

### PUT /api/capabilities/agent/:id/:cap_id

能力を更新します。

**Request Body**:
```json
{
  "proficiency": "optional - 1-5",
  "verified": "optional - boolean"
}
```

### POST /api/capabilities/match

タスク要件と能力のマッチングスコアを計算します。

**Request Body**:
```json
{
  "required_capabilities": ["backend", "authentication", "typescript"],
  "agent_id": "optional - 特定エージェント",
  "agents": ["optional - 複数エージェントを比較"]
}
```

**Response**:
```json
{
  "matches": [
    {
      "agent_id": "agent_xxx",
      "agent_name": "Backend Agent",
      "match_score": 95,
      "matched_capabilities": ["backend", "authentication", "typescript"],
      "missing_capabilities": [],
      "estimated_success_rate": 0.91,
      "recommendation": "highly_recommended"
    },
    {
      "agent_id": "agent_yyy",
      "agent_name": "Fullstack Agent",
      "match_score": 78,
      "matched_capabilities": ["backend", "typescript"],
      "missing_capabilities": ["authentication"],
      "estimated_success_rate": 0.75,
      "recommendation": "possible"
    }
  ]
}
```

### GET /api/capabilities/recommend

タスクに最適なエージェントを推薦します。

**Query Parameters**:
- `task_id` - タスクID
- `required_capabilities` - 必要能力（カンマ区切り）
- `limit` - 取得件数（default: 5）

**Response**:
```json
{
  "recommendations": [
    {
      "agent_id": "agent_xxx",
      "agent_name": "Backend Agent",
      "match_score": 95,
      "availability": "available",
      "current_workload": 2,
      "estimated_start_time": "2026-01-19T10:30:00Z",
      "reason": "全ての必要スキルを保持、成功率91%"
    }
  ],
  "task": {
    "task_id": "task_xxx",
    "required_capabilities": ["backend", "authentication"]
  }
}
```

## 使用例

### 能力を登録

```bash
/agent-capability register --skills=typescript,backend,hono,authentication
```

実行内容:
1. 指定したスキルを自分の能力として登録
2. デフォルト熟練度: 3 (Intermediate)

### 熟練度を更新

```bash
/agent-capability update --skill=typescript --proficiency=5
```

### タスクとのマッチング確認

```bash
/agent-capability match --task=task_123
```

実行内容:
1. task_123の必要スキルを取得
2. 自分の能力とマッチングスコアを計算
3. 不足スキルがあれば警告

### 推薦エージェント取得

```bash
/agent-capability recommend --capabilities=react,nextjs,testing
```

## マッチングスコア計算

マッチングスコアは以下の要素で計算されます：

```
base_score = (matched_count / required_count) * 100

proficiency_bonus = Σ(agent_proficiency[skill] - 3) * 5

success_rate_bonus = agent_success_rate[skill] * 10

match_score = base_score + proficiency_bonus + success_rate_bonus
```

### 推薦レベル

| スコア | 推薦レベル | 説明 |
|--------|-----------|------|
| 90-100 | `highly_recommended` | 最適なマッチング |
| 70-89 | `recommended` | 良好なマッチング |
| 50-69 | `possible` | 対応可能だが理想的ではない |
| 0-49 | `not_recommended` | 推奨しない |

## 能力の自動学習

タスク完了時に自動的に能力が更新されます：

1. **成功時**:
   - `success_rate`が再計算
   - 連続成功で`verified=true`に
   - 高い成功率で`proficiency`向上提案

2. **失敗時**:
   - `success_rate`が再計算
   - 連続失敗で警告通知
   - 能力見直しの提案

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `capability:registered` | 能力が登録された |
| `capability:updated` | 能力が更新された |
| `capability:verified` | 能力が検証済みに |
| `capability:degraded` | 能力評価が下がった |

## Hooks連携

エージェント起動時に自動で能力を登録するHooks設定：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "python .claude/hooks/register_capabilities.py",
        "timeout": 5000
      }
    ]
  }
}
```

## 関連スキル

- `/task-queue` - タスクキュー管理
- `/file-lock` - ファイルロック管理
- `/conductor` - コンダクター統括
- `/shared-context` - 共有コンテキスト

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_AGENT_CAPABILITIES | 初期能力（カンマ区切り） | なし |
