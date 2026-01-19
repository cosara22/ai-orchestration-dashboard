---
name: git-workflow
description: |
  Gitワークフロー管理スキル。マルチエージェント環境でのGit操作を統制:
  (1) ブランチ作成・切り替え
  (2) コミット・プッシュの調整
  (3) プルリクエスト作成
  (4) ブランチ戦略の適用
  (5) 変更の同期とリベース
  重要: ファイル編集前にブランチを作成し、作業完了後はPRを作成すること
user_invocable: true
version: 1.0.0
---

# Git Workflow Skill

マルチエージェント並列開発におけるGitワークフロー管理を行います。

## 使用方法

```
/git-workflow [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `branch` | ブランチ作成 | `/git-workflow branch --name=feat/auth` |
| `checkout` | ブランチ切り替え | `/git-workflow checkout --branch=feat/auth` |
| `commit` | コミット作成 | `/git-workflow commit --message="Add auth"` |
| `push` | プッシュ | `/git-workflow push` |
| `pr` | PR作成 | `/git-workflow pr --title="Add authentication"` |
| `sync` | 最新取得・同期 | `/git-workflow sync` |
| `status` | 状態確認 | `/git-workflow status` |
| `claim` | ブランチを自分に割り当て | `/git-workflow claim --branch=feat/auth` |
| `release` | ブランチ割り当て解放 | `/git-workflow release --branch=feat/auth` |

## ブランチ戦略

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Branch Strategy                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  main (protected)                                                   │
│    │                                                                │
│    ├── develop                                                      │
│    │     │                                                          │
│    │     ├── feat/auth-api          ← Backend Agent                │
│    │     │     └── (JWT実装)                                        │
│    │     │                                                          │
│    │     ├── feat/auth-ui           ← Frontend Agent               │
│    │     │     └── (ログインUI)                                     │
│    │     │                                                          │
│    │     ├── feat/auth-tests        ← Test Agent                   │
│    │     │     └── (認証テスト)                                     │
│    │     │                                                          │
│    │     └── fix/login-bug          ← Fullstack Agent              │
│    │           └── (バグ修正)                                       │
│    │                                                                │
│    └── release/v1.2.0                                               │
│          └── (リリース準備)                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### ブランチ命名規則

| プレフィックス | 用途 | 例 |
|---------------|------|-----|
| `feat/` | 新機能 | `feat/user-authentication` |
| `fix/` | バグ修正 | `fix/login-redirect` |
| `refactor/` | リファクタリング | `refactor/auth-module` |
| `docs/` | ドキュメント | `docs/api-reference` |
| `test/` | テスト追加 | `test/auth-unit-tests` |
| `chore/` | 雑務 | `chore/update-deps` |

## ブランチ所有権管理

マルチエージェント環境では、各ブランチに「所有者」を設定して競合を防ぎます。

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Branch Ownership                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Branch: feat/auth-api                                              │
│  ├── Owner: Backend Agent (agent_xxx)                              │
│  ├── Status: active                                                │
│  ├── Created: 2026-01-19T10:00:00Z                                 │
│  ├── Last Activity: 2026-01-19T14:30:00Z                           │
│  └── Protected Files:                                               │
│      ├── src/auth/*                                                │
│      └── src/middleware/auth.ts                                     │
│                                                                     │
│  Branch: feat/auth-ui                                               │
│  ├── Owner: Frontend Agent (agent_yyy)                             │
│  ├── Status: active                                                │
│  └── Protected Files:                                               │
│      ├── src/components/Login/*                                    │
│      └── src/pages/auth/*                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API エンドポイント

### POST /api/git/branch/create

ブランチを作成し、所有権を登録します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "branch_name": "required - ブランチ名",
  "base_branch": "optional - ベースブランチ (default: develop)",
  "agent_id": "required - エージェントID",
  "task_id": "optional - 関連タスクID",
  "protected_paths": ["optional - このエージェントが編集するファイルパス"],
  "description": "optional - ブランチの説明"
}
```

**Response**:
```json
{
  "success": true,
  "branch_id": "br_xxx",
  "branch_name": "feat/auth-api",
  "owner_agent_id": "agent_xxx",
  "created_at": "2026-01-19T10:00:00Z",
  "git_result": {
    "created": true,
    "checked_out": true
  }
}
```

### POST /api/git/branch/claim

既存ブランチの所有権を取得します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "branch_name": "required - ブランチ名",
  "agent_id": "required - エージェントID",
  "force": "optional - 強制取得 (default: false)"
}
```

**Response**:
```json
{
  "success": true,
  "branch_name": "feat/auth-api",
  "previous_owner": null,
  "new_owner": "agent_xxx",
  "claimed_at": "2026-01-19T10:00:00Z"
}
```

### POST /api/git/branch/release

ブランチの所有権を解放します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "branch_name": "required - ブランチ名",
  "agent_id": "required - エージェントID"
}
```

### GET /api/git/branches

ブランチ一覧と所有権情報を取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `status` - ステータスフィルタ（optional: active, merged, stale）
- `owner` - 所有者フィルタ（optional）

**Response**:
```json
{
  "branches": [
    {
      "branch_id": "br_xxx",
      "branch_name": "feat/auth-api",
      "base_branch": "develop",
      "owner_agent_id": "agent_xxx",
      "owner_name": "Backend Agent",
      "status": "active",
      "task_id": "task_yyy",
      "protected_paths": ["src/auth/*"],
      "commits_ahead": 5,
      "commits_behind": 2,
      "last_commit": "abc1234",
      "last_commit_message": "Add JWT validation",
      "last_activity": "2026-01-19T14:30:00Z",
      "created_at": "2026-01-19T10:00:00Z",
      "has_conflicts": false
    }
  ],
  "total": 5,
  "active": 3,
  "unowned": 1
}
```

### GET /api/git/branch/check

ブランチの状態と編集可否を確認します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `branch_name` - ブランチ名（必須）
- `agent_id` - エージェントID（必須）
- `file_path` - 編集したいファイルパス（optional）

**Response**:
```json
{
  "branch_name": "feat/auth-api",
  "can_edit": true,
  "is_owner": true,
  "owner_agent_id": "agent_xxx",
  "owner_name": "Backend Agent",
  "file_check": {
    "path": "src/auth/jwt.ts",
    "in_protected_paths": true,
    "can_edit": true
  },
  "branch_status": {
    "is_behind": true,
    "commits_behind": 2,
    "suggestion": "sync before editing"
  }
}
```

### POST /api/git/commit

コミットを作成します（所有権チェック付き）。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "agent_id": "required - エージェントID",
  "message": "required - コミットメッセージ",
  "files": ["optional - 特定ファイルのみコミット"],
  "push": "optional - コミット後にプッシュ (default: false)"
}
```

**Response**:
```json
{
  "success": true,
  "commit_hash": "abc1234def5678",
  "commit_message": "feat: Add JWT validation",
  "files_committed": ["src/auth/jwt.ts", "src/auth/types.ts"],
  "pushed": false,
  "branch": "feat/auth-api"
}
```

### POST /api/git/push

変更をプッシュします。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "agent_id": "required - エージェントID",
  "branch_name": "optional - ブランチ名 (default: current)",
  "force": "optional - 強制プッシュ (default: false)"
}
```

### POST /api/git/sync

ベースブランチの最新を取り込みます。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "agent_id": "required - エージェントID",
  "strategy": "optional - merge/rebase (default: rebase)"
}
```

**Response**:
```json
{
  "success": true,
  "strategy": "rebase",
  "commits_pulled": 3,
  "conflicts": [],
  "current_branch": "feat/auth-api",
  "base_branch": "develop",
  "is_up_to_date": true
}
```

### POST /api/git/pr/create

プルリクエストを作成します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "agent_id": "required - エージェントID",
  "title": "required - PRタイトル",
  "body": "optional - PR本文",
  "source_branch": "optional - ソースブランチ (default: current)",
  "target_branch": "optional - ターゲットブランチ (default: develop)",
  "reviewers": ["optional - レビュアー"],
  "labels": ["optional - ラベル"],
  "draft": "optional - ドラフトPR (default: false)",
  "auto_merge": "optional - 自動マージ設定 (default: false)"
}
```

**Response**:
```json
{
  "success": true,
  "pr_number": 123,
  "pr_url": "https://github.com/org/repo/pull/123",
  "title": "feat: Add JWT authentication",
  "source_branch": "feat/auth-api",
  "target_branch": "develop",
  "status": "open",
  "checks_pending": true
}
```

### GET /api/git/pr/list

プルリクエスト一覧を取得します。

**Response**:
```json
{
  "pull_requests": [
    {
      "pr_number": 123,
      "title": "feat: Add JWT authentication",
      "author_agent_id": "agent_xxx",
      "author_name": "Backend Agent",
      "source_branch": "feat/auth-api",
      "target_branch": "develop",
      "status": "open",
      "reviews": {
        "approved": 1,
        "changes_requested": 0,
        "pending": 1
      },
      "checks": {
        "passed": 5,
        "failed": 0,
        "pending": 1
      },
      "mergeable": true,
      "created_at": "2026-01-19T15:00:00Z",
      "updated_at": "2026-01-19T16:30:00Z"
    }
  ]
}
```

## 使用例

### 新しいタスクを開始

```bash
# ブランチ作成と所有権取得
/git-workflow branch --name=feat/user-profile --task=task_123 --protected=src/components/Profile/*

# 作業開始
# ... ファイル編集 ...

# コミット
/git-workflow commit --message="feat: Add user profile component"

# プッシュ
/git-workflow push
```

### PRを作成

```bash
# 最新を取り込み
/git-workflow sync

# PR作成
/git-workflow pr --title="feat: Add user profile" --reviewers=Frontend Agent
```

### 既存ブランチで作業

```bash
# ブランチ確認
/git-workflow status --branch=feat/existing-feature

# 所有権取得
/git-workflow claim --branch=feat/existing-feature

# 作業開始
# ...
```

## ワークフローの流れ

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Git Workflow Flow                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. タスク割り当て                                                  │
│     ↓                                                               │
│  2. /git-workflow branch                                            │
│     - ブランチ作成                                                  │
│     - 所有権登録                                                    │
│     - protected_paths設定                                           │
│     ↓                                                               │
│  3. ファイル編集                                                    │
│     - 所有権チェック（自動）                                        │
│     - protected_paths内のみ編集可能                                 │
│     ↓                                                               │
│  4. /git-workflow commit                                            │
│     - 変更をコミット                                                │
│     - コミットメッセージ検証                                        │
│     ↓                                                               │
│  5. /git-workflow sync                                              │
│     - ベースブランチと同期                                          │
│     - 競合があれば通知                                              │
│     ↓                                                               │
│  6. /git-workflow push                                              │
│     - リモートにプッシュ                                            │
│     ↓                                                               │
│  7. /git-workflow pr                                                │
│     - PR作成                                                        │
│     - レビュアー設定                                                │
│     ↓                                                               │
│  8. コードレビュー                                                  │
│     - /code-review で自動レビュー                                   │
│     - 人間レビュー（オプション）                                    │
│     ↓                                                               │
│  9. /merge-coordinator merge                                        │
│     - マージ実行                                                    │
│     - ブランチ削除                                                  │
│     - 所有権解放                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Hooks連携

ファイル編集前に所有権をチェックするHooks設定：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": {
          "tool_name": "Write|Edit"
        },
        "command": "python .claude/hooks/check_branch_ownership.py",
        "timeout": 5000
      }
    ]
  }
}
```

### Hooksスクリプト例

```python
# .claude/hooks/check_branch_ownership.py
import json
import sys
import subprocess
import requests
import os

def check_ownership():
    input_data = json.load(sys.stdin)
    file_path = input_data.get("tool_input", {}).get("file_path")

    if not file_path:
        return

    agent_id = os.environ.get("AOD_AGENT_ID", "unknown")
    project_id = os.environ.get("AOD_PROJECT_ID", "default")

    # 現在のブランチを取得
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        capture_output=True, text=True
    )
    current_branch = result.stdout.strip()

    # 所有権チェック
    response = requests.get(
        f"{os.environ.get('AOD_URL', 'http://localhost:4000')}/api/git/branch/check",
        params={
            "project_id": project_id,
            "branch_name": current_branch,
            "agent_id": agent_id,
            "file_path": file_path
        }
    )
    result = response.json()

    if not result.get("can_edit"):
        owner = result.get("owner_name", "Unknown")
        print(json.dumps({
            "decision": "block",
            "reason": f"Branch owned by {owner}. File not in your protected paths."
        }))
        sys.exit(1)

if __name__ == "__main__":
    check_ownership()
```

## コミットメッセージ規約

```
<type>(<scope>): <subject>

<body>

<footer>
```

### タイプ

| タイプ | 説明 |
|--------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメント |
| `style` | フォーマット |
| `refactor` | リファクタリング |
| `test` | テスト |
| `chore` | 雑務 |

### 例

```
feat(auth): Add JWT token validation

- Implement token verification
- Add expiration check
- Create refresh token flow

Closes #123
Co-Authored-By: Backend Agent <backend@aod.local>
```

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `git:branch_created` | ブランチ作成 |
| `git:branch_claimed` | 所有権取得 |
| `git:branch_released` | 所有権解放 |
| `git:commit_pushed` | コミットプッシュ |
| `git:pr_created` | PR作成 |
| `git:pr_merged` | PRマージ |
| `git:conflict_detected` | 競合検出 |

## 関連スキル

- `/file-lock` - ファイルロック管理
- `/code-review` - コードレビュー
- `/merge-coordinator` - マージ調整
- `/conductor` - コンダクター統括

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
| AOD_GIT_BASE_BRANCH | デフォルトベースブランチ | develop |
| AOD_GIT_REMOTE | リモート名 | origin |
