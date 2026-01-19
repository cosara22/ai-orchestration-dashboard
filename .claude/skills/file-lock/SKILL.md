---
name: file-lock
description: |
  ファイルロック管理スキル。マルチエージェント環境でのファイル競合防止に使用:
  (1) ファイルのロック取得
  (2) ロック状態の確認
  (3) ロックの解放
  (4) 競合の検出と解決
  (5) ロック履歴の確認
  重要: ファイル編集前に必ずロックを取得すること
user_invocable: true
version: 1.0.0
---

# File Lock Skill

マルチエージェント並列開発におけるファイルロック管理を行います。

## 使用方法

```
/file-lock [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `acquire` | ロック取得 | `/file-lock acquire --file=src/auth.ts` |
| `release` | ロック解放 | `/file-lock release --file=src/auth.ts` |
| `check` | ロック状態確認 | `/file-lock check --file=src/auth.ts` |
| `list` | ロック一覧 | `/file-lock list` |
| `my` | 自分のロック確認 | `/file-lock my` |
| `force-release` | 強制解放（管理者） | `/file-lock force-release --id=xxx` |
| `conflicts` | 競合履歴確認 | `/file-lock conflicts` |

## ロックタイプ

| タイプ | 説明 | 同時取得 |
|--------|------|---------|
| `exclusive` | 排他ロック（編集用） | 不可 |
| `shared` | 共有ロック（読み取り用） | 可能 |

## ロック状態

| 状態 | 説明 |
|------|------|
| `active` | ロック有効 |
| `released` | 正常解放済み |
| `expired` | 有効期限切れで自動解放 |
| `force_released` | 管理者により強制解放 |

## API エンドポイント

### POST /api/locks/acquire

ファイルのロックを取得します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "file_path": "required - ファイルパス",
  "agent_id": "required - エージェントID",
  "lock_type": "optional - exclusive/shared (default: exclusive)",
  "reason": "optional - ロック理由",
  "timeout_minutes": "optional - 有効期限分 (default: 30)"
}
```

**Response (成功)**:
```json
{
  "success": true,
  "lock_id": "lock_xxx",
  "file_path": "src/auth/jwt.ts",
  "acquired_at": "2026-01-19T10:00:00Z",
  "expires_at": "2026-01-19T10:30:00Z"
}
```

**Response (競合)**:
```json
{
  "success": false,
  "conflict": {
    "lock_id": "lock_yyy",
    "locked_by": "agent_zzz",
    "agent_name": "Backend Agent",
    "lock_type": "exclusive",
    "acquired_at": "2026-01-19T09:45:00Z",
    "expires_at": "2026-01-19T10:15:00Z",
    "reason": "JWT認証の実装中"
  },
  "suggestion": "15分後に再試行するか、エージェントに連絡してください"
}
```

### POST /api/locks/release

ロックを解放します。

**Request Body**:
```json
{
  "lock_id": "optional - ロックID（指定時はこちらを優先）",
  "file_path": "optional - ファイルパス",
  "agent_id": "required - エージェントID"
}
```

**Response**:
```json
{
  "success": true,
  "lock_id": "lock_xxx",
  "released_at": "2026-01-19T10:20:00Z",
  "duration_minutes": 20
}
```

### GET /api/locks/check

ファイルのロック状態を確認します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `file_path` - ファイルパス（必須）
- `agent_id` - エージェントID（optional、自分がロック保持者か確認）

**Response**:
```json
{
  "file_path": "src/auth/jwt.ts",
  "locked": true,
  "lock_type": "exclusive",
  "locked_by": "agent_xxx",
  "agent_name": "Backend Agent",
  "is_mine": false,
  "acquired_at": "2026-01-19T09:45:00Z",
  "expires_at": "2026-01-19T10:15:00Z",
  "reason": "JWT認証の実装中"
}
```

### GET /api/locks/list

プロジェクト内のロック一覧を取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `status` - ステータスフィルタ（optional）
- `agent_id` - エージェントフィルタ（optional）

**Response**:
```json
{
  "locks": [
    {
      "lock_id": "lock_xxx",
      "file_path": "src/auth/jwt.ts",
      "agent_id": "agent_xxx",
      "agent_name": "Backend Agent",
      "lock_type": "exclusive",
      "status": "active",
      "reason": "JWT認証の実装中",
      "acquired_at": "2026-01-19T09:45:00Z",
      "expires_at": "2026-01-19T10:15:00Z"
    }
  ],
  "total": 5,
  "active": 3,
  "expired": 2
}
```

### GET /api/locks/agent/:id

エージェントが保持しているロック一覧を取得します。

**Response**:
```json
{
  "agent_id": "agent_xxx",
  "locks": [
    {
      "lock_id": "lock_xxx",
      "file_path": "src/auth/jwt.ts",
      "lock_type": "exclusive",
      "acquired_at": "2026-01-19T09:45:00Z",
      "expires_at": "2026-01-19T10:15:00Z"
    }
  ],
  "total_locks": 1
}
```

### POST /api/locks/force-release

管理者権限でロックを強制解放します。

**Request Body**:
```json
{
  "lock_id": "required - ロックID",
  "reason": "required - 強制解放理由"
}
```

### GET /api/conflicts/history

競合履歴を取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `limit` - 取得件数（default: 50）

**Response**:
```json
{
  "conflicts": [
    {
      "conflict_id": "conf_xxx",
      "conflict_type": "file_edit",
      "involved_agents": ["agent_xxx", "agent_yyy"],
      "involved_resources": {
        "file_path": "src/auth/jwt.ts"
      },
      "description": "Backend AgentとFullstack Agentが同時編集を試行",
      "resolution_strategy": "wait",
      "resolution_result": "Backend Agentが完了後にFullstack Agentが作業開始",
      "detected_at": "2026-01-19T10:00:00Z",
      "resolved_at": "2026-01-19T10:25:00Z",
      "status": "resolved"
    }
  ]
}
```

## 使用例

### ファイル編集前にロック取得

```bash
/file-lock acquire --file=src/auth/jwt.ts --reason="JWT認証の実装"
```

実行内容:
1. 指定ファイルのロック状態を確認
2. ロックが空いていれば取得
3. 競合があればエラーと詳細を返却

### 編集完了後にロック解放

```bash
/file-lock release --file=src/auth/jwt.ts
```

### 複数ファイルのロック確認

```bash
/file-lock check --files=src/auth/jwt.ts,src/middleware/auth.ts
```

## 自動ロック機構（Hooks連携）

ファイル編集前に自動でロックを取得するHooks設定：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": {
          "tool_name": "Write|Edit"
        },
        "command": "python .claude/hooks/check_file_lock.py",
        "timeout": 5000
      }
    ],
    "PostToolUse": [
      {
        "matcher": {
          "tool_name": "Write|Edit"
        },
        "command": "python .claude/hooks/release_file_lock.py",
        "timeout": 5000
      }
    ]
  }
}
```

### Hooksスクリプト例

```python
# .claude/hooks/check_file_lock.py
import json
import sys
import requests
import os

def check_lock():
    # 標準入力からツール情報を取得
    input_data = json.load(sys.stdin)
    file_path = input_data.get("tool_input", {}).get("file_path")

    if not file_path:
        return

    agent_id = os.environ.get("AOD_AGENT_ID", "unknown")
    project_id = os.environ.get("AOD_PROJECT_ID", "default")

    # ロック確認
    response = requests.get(
        f"{os.environ.get('AOD_URL', 'http://localhost:4000')}/api/locks/check",
        params={
            "project_id": project_id,
            "file_path": file_path,
            "agent_id": agent_id
        }
    )
    result = response.json()

    if result.get("locked") and not result.get("is_mine"):
        # 他のエージェントがロック中 → ブロック
        print(json.dumps({
            "decision": "block",
            "reason": f"File locked by {result['agent_name']}: {result.get('reason', 'No reason')}"
        }))
        sys.exit(1)

    # ロック取得
    requests.post(
        f"{os.environ.get('AOD_URL', 'http://localhost:4000')}/api/locks/acquire",
        json={
            "project_id": project_id,
            "file_path": file_path,
            "agent_id": agent_id,
            "lock_type": "exclusive",
            "timeout_minutes": 30
        }
    )

if __name__ == "__main__":
    check_lock()
```

## 競合解決戦略

| 戦略 | 説明 | 適用条件 |
|------|------|---------|
| `wait` | ロック解放を待機 | 短時間で解放予想 |
| `merge` | 変更をマージ | 非競合的な変更 |
| `escalate` | コンダクターに報告 | 複雑な競合 |
| `rollback` | 一方をロールバック | 致命的な競合 |

## 有効期限と自動解放

- **デフォルト有効期限**: 30分
- **延長**: ロック保持中に再取得で延長可能
- **自動解放**: 有効期限後に自動でステータスが`expired`に
- **クリーンアップ**: 1時間ごとに期限切れロックを削除

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `lock:acquired` | ロックが取得された |
| `lock:released` | ロックが解放された |
| `lock:expired` | ロックが期限切れ |
| `lock:conflict` | 競合が発生 |
| `lock:force_released` | 強制解放された |

## 関連スキル

- `/task-queue` - タスクキュー管理
- `/agent-capability` - エージェント能力管理
- `/conductor` - コンダクター統括
- `/shared-context` - 共有コンテキスト

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
| AOD_LOCK_TIMEOUT | ロックタイムアウト分 | 30 |
