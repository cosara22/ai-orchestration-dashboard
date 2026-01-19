---
name: shared-context
description: |
  共有コンテキスト管理スキル。マルチエージェント環境での情報共有に使用:
  (1) 決定事項の共有
  (2) ブロッカーの報告
  (3) 学習内容の記録
  (4) 状態更新の通知
  (5) 他エージェントからのコンテキスト取得
  重要: 重要な情報は必ず共有コンテキストに記録すること
user_invocable: true
version: 1.0.0
---

# Shared Context Skill

マルチエージェント並列開発における情報共有基盤を提供します。

## 使用方法

```
/shared-context [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `post` | コンテキスト投稿 | `/shared-context post --type=decision --title="JWT採用"` |
| `list` | コンテキスト一覧 | `/shared-context list` |
| `get` | コンテキスト詳細 | `/shared-context get --id=ctx_xxx` |
| `search` | コンテキスト検索 | `/shared-context search --query="認証"` |
| `my` | 自分の投稿一覧 | `/shared-context my` |
| `for-me` | 自分向けコンテキスト取得 | `/shared-context for-me` |
| `subscribe` | 特定タイプを購読 | `/shared-context subscribe --types=blocker,decision` |

## コンテキストタイプ

| タイプ | 説明 | 用途 | 有効期限 |
|--------|------|------|---------|
| `decision` | 意思決定 | 技術選定、設計判断 | 永続 |
| `blocker` | ブロッカー | 作業を妨げる問題 | 解決まで |
| `learning` | 学習内容 | 発見、ノウハウ | 永続 |
| `status` | 状態報告 | 進捗、現在の作業 | 1時間 |
| `artifact` | 成果物 | ドキュメント、リンク | 永続 |
| `warning` | 警告 | 注意事項、リスク | 永続 |

## 可視性レベル

| レベル | 説明 |
|--------|------|
| `all` | 全エージェントに公開 |
| `team` | 同じプロジェクトのエージェントに公開 |
| `private` | 自分のみ参照可能 |

## API エンドポイント

### POST /api/context

コンテキストを投稿します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "context_type": "required - decision/blocker/learning/status/artifact/warning",
  "title": "required - タイトル",
  "content": "required - 内容（マークダウン可）",
  "author_agent_id": "required - 作成者エージェントID",
  "visibility": "optional - all/team/private (default: all)",
  "priority": "optional - 0-10 (default: 5)",
  "tags": ["optional - タグ配列"],
  "related_task_id": "optional - 関連タスクID",
  "related_file_paths": ["optional - 関連ファイルパス"],
  "expires_in_hours": "optional - 有効期限（時間）"
}
```

**Response**:
```json
{
  "context_id": "ctx_xxx",
  "created_at": "2026-01-19T10:00:00Z",
  "expires_at": null,
  "notified_agents": 5
}
```

### GET /api/context

コンテキスト一覧を取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `context_type` - タイプフィルタ（optional）
- `author_agent_id` - 作成者フィルタ（optional）
- `tags` - タグフィルタ（optional、カンマ区切り）
- `active_only` - アクティブのみ（optional、default: true）
- `limit` - 取得件数（default: 50）
- `offset` - オフセット（default: 0）

**Response**:
```json
{
  "contexts": [
    {
      "context_id": "ctx_xxx",
      "context_type": "decision",
      "title": "認証方式はJWTを採用",
      "content": "## 決定事項\n\n認証方式としてJWTを採用する。\n\n### 理由\n- ステートレスでスケーラブル\n- モバイル対応が容易",
      "author_agent_id": "agent_xxx",
      "author_name": "Backend Agent",
      "visibility": "all",
      "priority": 8,
      "tags": ["authentication", "jwt", "backend"],
      "related_task_id": "task_yyy",
      "created_at": "2026-01-19T10:00:00Z",
      "updated_at": "2026-01-19T10:00:00Z",
      "expires_at": null
    }
  ],
  "total": 25,
  "has_more": false
}
```

### GET /api/context/:id

コンテキスト詳細を取得します。

**Response**:
```json
{
  "context_id": "ctx_xxx",
  "context_type": "blocker",
  "title": "外部APIのレート制限に到達",
  "content": "## 問題\n\nGitHub APIのレート制限（5000 req/hour）に到達。\n\n## 影響\n- コード解析タスクがブロック\n- PR作成機能が使用不可\n\n## 回避策\n- 認証トークンを追加\n- キャッシュ層を導入",
  "author_agent_id": "agent_xxx",
  "author_name": "DevOps Agent",
  "visibility": "all",
  "priority": 9,
  "tags": ["blocker", "api", "github"],
  "related_task_id": "task_zzz",
  "related_file_paths": ["src/services/github.ts"],
  "created_at": "2026-01-19T10:00:00Z",
  "updated_at": "2026-01-19T10:30:00Z",
  "expires_at": null,
  "comments": [
    {
      "comment_id": "cmt_xxx",
      "author_agent_id": "agent_yyy",
      "author_name": "Backend Agent",
      "content": "キャッシュ層の実装を開始します",
      "created_at": "2026-01-19T10:15:00Z"
    }
  ]
}
```

### PUT /api/context/:id

コンテキストを更新します。

**Request Body**:
```json
{
  "title": "optional - 更新後タイトル",
  "content": "optional - 更新後内容",
  "priority": "optional - 優先度",
  "tags": ["optional - タグ"],
  "status": "optional - active/resolved/archived"
}
```

### DELETE /api/context/:id

コンテキストを削除します。

### GET /api/context/for-agent/:agent_id

エージェント向けの関連コンテキストを取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `include_types` - 含めるタイプ（optional）

**Response**:
```json
{
  "agent_id": "agent_xxx",
  "relevant_contexts": [
    {
      "context_id": "ctx_xxx",
      "context_type": "decision",
      "title": "認証方式はJWTを採用",
      "relevance_score": 0.95,
      "relevance_reason": "現在作業中のタスクに関連"
    }
  ],
  "active_blockers": [
    {
      "context_id": "ctx_yyy",
      "title": "外部APIのレート制限に到達",
      "priority": 9,
      "affects_your_tasks": true
    }
  ],
  "recent_decisions": [
    {
      "context_id": "ctx_zzz",
      "title": "フロントエンドはNext.js 15を使用",
      "decided_at": "2026-01-19T09:00:00Z"
    }
  ],
  "team_status": [
    {
      "agent_id": "agent_aaa",
      "agent_name": "Frontend Agent",
      "status": "ログインUI実装中",
      "progress": 60,
      "updated_at": "2026-01-19T10:00:00Z"
    }
  ],
  "warnings": [
    {
      "context_id": "ctx_www",
      "title": "本番環境への変更は要承認",
      "priority": 10
    }
  ]
}
```

### GET /api/context/search

コンテキストを検索します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `query` - 検索クエリ（必須）
- `context_type` - タイプフィルタ（optional）
- `limit` - 取得件数（default: 20）

**Response**:
```json
{
  "query": "認証",
  "results": [
    {
      "context_id": "ctx_xxx",
      "title": "認証方式はJWTを採用",
      "snippet": "...認証方式としてJWTを採用する...",
      "score": 0.95,
      "context_type": "decision",
      "created_at": "2026-01-19T10:00:00Z"
    }
  ],
  "total": 5
}
```

## 使用例

### 決定事項を共有

```bash
/shared-context post --type=decision --title="認証方式はJWTを採用" --content="## 理由\n- ステートレス\n- スケーラブル" --tags=authentication,jwt
```

実行内容:
1. 決定事項をshared_contextに保存
2. 全エージェントにWebSocket通知
3. 関連タスクに紐付け（指定時）

### ブロッカーを報告

```bash
/shared-context post --type=blocker --title="外部APIエラー" --content="GitHub APIが503を返している" --priority=9
```

実行内容:
1. ブロッカーを高優先度で登録
2. コンダクターに即座に通知
3. 影響を受けるタスクを自動特定

### 進捗状況を更新

```bash
/shared-context post --type=status --title="認証API実装中" --content="JWT生成機能完了、検証機能を実装中" --expires=1h
```

### 関連コンテキストを取得

```bash
/shared-context for-me
```

実行内容:
1. 自分のスキル・現在のタスクに関連するコンテキストを取得
2. アクティブなブロッカーを取得
3. 最近の決定事項を取得
4. チームの状態を取得

### コンテキスト検索

```bash
/shared-context search --query="React パフォーマンス"
```

## Hooks連携

エージェント起動時に自動でコンテキストを取得するHooks設定：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "python .claude/hooks/inject_context.py",
        "timeout": 10000
      }
    ]
  }
}
```

### Hooksスクリプト例

```python
# .claude/hooks/inject_context.py
import json
import requests
import os

def get_context_for_agent():
    agent_id = os.environ.get("AOD_AGENT_ID", "unknown")
    project_id = os.environ.get("AOD_PROJECT_ID", "default")

    response = requests.get(
        f"{os.environ.get('AOD_URL', 'http://localhost:4000')}/api/context/for-agent/{agent_id}",
        params={"project_id": project_id}
    )
    contexts = response.json()

    # コンテキストメッセージを生成
    msg = format_context_message(contexts)
    print(msg)

def format_context_message(contexts):
    msg = "## 📋 Current Project Context\n\n"

    # アクティブブロッカー
    if contexts.get("active_blockers"):
        msg += "### ⛔ Active Blockers\n"
        for b in contexts["active_blockers"]:
            msg += f"- **{b['title']}** (Priority: {b['priority']})\n"
        msg += "\n"

    # 最近の決定事項
    if contexts.get("recent_decisions"):
        msg += "### 🎯 Recent Decisions\n"
        for d in contexts["recent_decisions"]:
            msg += f"- **{d['title']}**\n"
        msg += "\n"

    # 警告
    if contexts.get("warnings"):
        msg += "### ⚠️ Warnings\n"
        for w in contexts["warnings"]:
            msg += f"- **{w['title']}**\n"
        msg += "\n"

    # チーム状態
    if contexts.get("team_status"):
        msg += "### 👥 Team Status\n"
        for s in contexts["team_status"]:
            msg += f"- **{s['agent_name']}**: {s['status']} ({s['progress']}%)\n"
        msg += "\n"

    return msg

if __name__ == "__main__":
    get_context_for_agent()
```

## コンテキスト自動整理

- **status**タイプ: 1時間後に自動アーカイブ
- **blocker**タイプ: resolvedに更新されたら24時間後にアーカイブ
- **古いコンテキスト**: 30日経過でアーカイブ（decision, learning, warningは除く）

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `context:created` | 新しいコンテキストが作成された |
| `context:updated` | コンテキストが更新された |
| `context:blocker_created` | ブロッカーが作成された（高優先度通知） |
| `context:blocker_resolved` | ブロッカーが解決された |
| `context:decision_made` | 重要な決定が行われた |

## ベストプラクティス

### 決定事項（decision）

```markdown
## 決定事項
[簡潔な決定内容]

## 理由
- [理由1]
- [理由2]

## 代替案
- [検討した代替案]

## 影響
- [この決定の影響]
```

### ブロッカー（blocker）

```markdown
## 問題
[問題の説明]

## 影響範囲
- [影響を受けるタスク/機能]

## 回避策
- [もしあれば]

## 解決予定
[解決の見込み]
```

### 学習内容（learning）

```markdown
## 発見
[学んだこと]

## 背景
[どのような状況で発見したか]

## 適用場面
[今後どのような場面で役立つか]
```

## 関連スキル

- `/task-queue` - タスクキュー管理
- `/agent-capability` - エージェント能力管理
- `/file-lock` - ファイルロック管理
- `/conductor` - コンダクター統括

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
| AOD_CONTEXT_INJECT | 起動時コンテキスト注入 | true |
