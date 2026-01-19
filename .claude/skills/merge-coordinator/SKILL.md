---
name: merge-coordinator
description: |
  マージコーディネータースキル。マルチエージェント環境でのマージ調整を担当:
  (1) マージ競合の検出と解決
  (2) マージ順序の調整
  (3) 依存関係のあるPRの管理
  (4) マージ後の検証
  (5) リリースブランチの管理
  重要: 複数PRのマージ時は必ずこのスキルで調整すること
user_invocable: true
version: 1.0.0
---

# Merge Coordinator Skill

マルチエージェント並列開発におけるマージ調整を行います。

## 使用方法

```
/merge-coordinator [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `check` | マージ可能性チェック | `/merge-coordinator check --pr=123` |
| `merge` | マージ実行 | `/merge-coordinator merge --pr=123` |
| `queue` | マージキューに追加 | `/merge-coordinator queue --pr=123` |
| `conflicts` | 競合検出 | `/merge-coordinator conflicts --branch=feat/auth` |
| `resolve` | 競合解決 | `/merge-coordinator resolve --pr=123` |
| `order` | マージ順序確認 | `/merge-coordinator order` |
| `release` | リリース準備 | `/merge-coordinator release --version=1.2.0` |

## マージ戦略

| 戦略 | 説明 | 使用場面 |
|------|------|---------|
| `merge` | マージコミット作成 | デフォルト |
| `squash` | スカッシュマージ | 細かいコミットをまとめる |
| `rebase` | リベースマージ | 履歴を直線的に保つ |

## マージキュー

複数のPRを安全にマージするためのキューシステム。

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Merge Queue                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Position 1: PR #123 (feat/auth-api)                               │
│  ├── Status: merging                                               │
│  ├── Checks: ✅ passed                                             │
│  ├── Reviews: ✅ approved (2/2)                                    │
│  └── Conflicts: none                                               │
│                                                                     │
│  Position 2: PR #124 (feat/auth-ui)                                │
│  ├── Status: waiting                                               │
│  ├── Checks: ✅ passed                                             │
│  ├── Reviews: ✅ approved (2/2)                                    │
│  └── Conflicts: depends on #123                                    │
│                                                                     │
│  Position 3: PR #125 (fix/login-bug)                               │
│  ├── Status: waiting                                               │
│  ├── Checks: ⏳ running                                            │
│  ├── Reviews: ✅ approved (1/1)                                    │
│  └── Conflicts: none                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API エンドポイント

### GET /api/merge/check/:pr_number

PRのマージ可能性をチェックします。

**Response**:
```json
{
  "pr_number": 123,
  "title": "feat: Add JWT authentication",
  "source_branch": "feat/auth-api",
  "target_branch": "develop",
  "mergeable": true,
  "merge_status": {
    "can_merge": true,
    "blockers": []
  },
  "checks": {
    "all_passed": true,
    "details": [
      {"name": "build", "status": "success"},
      {"name": "test", "status": "success"},
      {"name": "lint", "status": "success"}
    ]
  },
  "reviews": {
    "approved": true,
    "required": 2,
    "current": 2,
    "reviewers": [
      {"agent_id": "agent_xxx", "decision": "approved"},
      {"agent_id": "agent_yyy", "decision": "approved"}
    ]
  },
  "conflicts": {
    "has_conflicts": false,
    "conflicting_files": []
  },
  "dependencies": {
    "has_dependencies": false,
    "dependent_prs": []
  },
  "suggested_strategy": "squash",
  "estimated_merge_time": "2026-01-19T17:00:00Z"
}
```

### POST /api/merge/execute

マージを実行します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "pr_number": "required - PR番号",
  "agent_id": "required - 実行エージェントID",
  "strategy": "optional - merge/squash/rebase (default: squash)",
  "delete_branch": "optional - マージ後にブランチ削除 (default: true)",
  "commit_message": "optional - カスタムコミットメッセージ"
}
```

**Response**:
```json
{
  "success": true,
  "pr_number": 123,
  "merge_commit": "abc1234def5678",
  "strategy": "squash",
  "target_branch": "develop",
  "branch_deleted": true,
  "merged_at": "2026-01-19T17:00:00Z",
  "post_merge_actions": [
    {"action": "branch_ownership_released", "branch": "feat/auth-api"},
    {"action": "related_tasks_updated", "tasks": ["task_xxx"]}
  ]
}
```

### POST /api/merge/queue/add

マージキューにPRを追加します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "pr_number": "required - PR番号",
  "agent_id": "required - リクエストエージェントID",
  "priority": "optional - 優先度 (default: normal)",
  "depends_on": ["optional - 依存するPR番号"],
  "strategy": "optional - マージ戦略"
}
```

**Response**:
```json
{
  "queue_id": "mq_xxx",
  "pr_number": 123,
  "position": 2,
  "estimated_merge_time": "2026-01-19T17:30:00Z",
  "status": "queued",
  "depends_on": [],
  "blocking": [124]
}
```

### GET /api/merge/queue

マージキューの状態を取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `status` - ステータスフィルタ（optional）

**Response**:
```json
{
  "queue": [
    {
      "queue_id": "mq_xxx",
      "position": 1,
      "pr_number": 123,
      "title": "feat: Add JWT authentication",
      "author_agent_id": "agent_xxx",
      "status": "merging",
      "priority": "high",
      "depends_on": [],
      "blocking": [124],
      "queued_at": "2026-01-19T16:00:00Z",
      "estimated_merge": "2026-01-19T17:00:00Z"
    },
    {
      "queue_id": "mq_yyy",
      "position": 2,
      "pr_number": 124,
      "title": "feat: Add login UI",
      "author_agent_id": "agent_yyy",
      "status": "waiting",
      "priority": "normal",
      "depends_on": [123],
      "blocking": [],
      "queued_at": "2026-01-19T16:05:00Z",
      "estimated_merge": "2026-01-19T17:30:00Z"
    }
  ],
  "total": 3,
  "merging": 1,
  "waiting": 2
}
```

### GET /api/merge/conflicts/:branch

ブランチの競合を検出します。

**Response**:
```json
{
  "branch": "feat/auth-api",
  "base_branch": "develop",
  "has_conflicts": true,
  "conflicts": [
    {
      "file": "src/middleware/auth.ts",
      "conflict_type": "content",
      "base_content": "// Base version",
      "head_content": "// Head version",
      "their_content": "// Their version",
      "lines": [45, 46, 47, 48]
    }
  ],
  "conflicting_prs": [
    {
      "pr_number": 125,
      "title": "fix: Update auth middleware",
      "author": "Fullstack Agent",
      "overlapping_files": ["src/middleware/auth.ts"]
    }
  ],
  "resolution_suggestions": [
    {
      "strategy": "rebase",
      "description": "developブランチをリベースして競合を解決",
      "estimated_effort": "low"
    },
    {
      "strategy": "manual",
      "description": "手動で競合を解決",
      "estimated_effort": "medium"
    }
  ]
}
```

### POST /api/merge/conflicts/resolve

競合を解決します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "pr_number": "required - PR番号",
  "agent_id": "required - 解決エージェントID",
  "strategy": "required - rebase/manual/theirs/ours",
  "resolutions": [
    {
      "file": "required - ファイルパス",
      "resolution": "required - 解決内容"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "pr_number": 123,
  "resolved_files": ["src/middleware/auth.ts"],
  "remaining_conflicts": [],
  "new_commit": "def5678abc1234",
  "resolved_at": "2026-01-19T17:15:00Z"
}
```

### POST /api/merge/release

リリースブランチを作成します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "version": "required - バージョン番号",
  "agent_id": "required - 実行エージェントID",
  "base_branch": "optional - ベースブランチ (default: develop)",
  "include_prs": ["optional - 含めるPR番号"],
  "changelog": "optional - 変更履歴"
}
```

**Response**:
```json
{
  "success": true,
  "release_branch": "release/v1.2.0",
  "version": "1.2.0",
  "included_prs": [123, 124, 125],
  "changelog": "## v1.2.0\n\n- feat: Add JWT authentication (#123)\n- feat: Add login UI (#124)\n- fix: Login bug (#125)",
  "created_at": "2026-01-19T18:00:00Z",
  "next_steps": [
    "Run final tests on release branch",
    "Create PR to main",
    "Tag release after merge"
  ]
}
```

## 使用例

### PRのマージ

```bash
# マージ可能性チェック
/merge-coordinator check --pr=123

# マージ実行
/merge-coordinator merge --pr=123 --strategy=squash
```

### マージキューへの追加

```bash
# キューに追加（依存関係あり）
/merge-coordinator queue --pr=124 --depends-on=123

# キュー状態確認
/merge-coordinator order
```

### 競合解決

```bash
# 競合検出
/merge-coordinator conflicts --branch=feat/auth-api

# 競合解決（リベース）
/merge-coordinator resolve --pr=123 --strategy=rebase
```

### リリース作成

```bash
# リリースブランチ作成
/merge-coordinator release --version=1.2.0 --include=123,124,125
```

## マージ順序決定アルゴリズム

```typescript
function determineMergeOrder(prs: PullRequest[]): PullRequest[] {
  // 1. 依存関係グラフを構築
  const dependencyGraph = buildDependencyGraph(prs);

  // 2. トポロジカルソート
  const sorted = topologicalSort(dependencyGraph);

  // 3. 優先度でソート（同一レベル内）
  sorted.sort((a, b) => {
    if (a.level === b.level) {
      return b.priority - a.priority;  // 高優先度が先
    }
    return a.level - b.level;  // 依存が少ない方が先
  });

  // 4. 競合チェック
  for (const pr of sorted) {
    const conflicts = detectConflicts(pr);
    if (conflicts.length > 0) {
      pr.status = 'blocked';
      pr.blockedBy = conflicts;
    }
  }

  return sorted;
}
```

## マージ前チェックリスト

| チェック | 説明 | 必須 |
|----------|------|------|
| CI/CDパス | 全てのチェックがパス | Yes |
| レビュー承認 | 必要数の承認を取得 | Yes |
| 競合なし | ベースブランチとの競合がない | Yes |
| 依存PR完了 | 依存するPRがマージ済み | Yes |
| ブランチ最新 | ベースブランチの最新を取り込み済み | Recommended |
| テストカバレッジ | カバレッジが基準以上 | Optional |

## 競合解決戦略

| 戦略 | 説明 | 適用場面 |
|------|------|---------|
| `rebase` | リベースして競合解決 | 小規模な競合 |
| `manual` | 手動で競合解決 | 複雑な競合 |
| `theirs` | 相手の変更を採用 | 自分の変更を破棄 |
| `ours` | 自分の変更を採用 | 相手の変更を破棄 |
| `escalate` | コンダクターに報告 | 判断が必要な競合 |

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `merge:queued` | マージキューに追加 |
| `merge:started` | マージ開始 |
| `merge:completed` | マージ完了 |
| `merge:failed` | マージ失敗 |
| `merge:conflict_detected` | 競合検出 |
| `merge:conflict_resolved` | 競合解決 |
| `merge:queue_updated` | キュー更新 |

## マージワークフロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Merge Workflow                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. PRレビュー完了                                                  │
│     ↓                                                               │
│  2. /merge-coordinator check                                        │
│     - CI/CDチェック確認                                             │
│     - レビュー承認確認                                              │
│     - 競合チェック                                                  │
│     ↓                                                               │
│  3. 競合あり？                                                      │
│     ├── Yes → /merge-coordinator resolve                            │
│     │         - 競合を解決                                          │
│     │         - 再プッシュ                                          │
│     │         → 2に戻る                                             │
│     └── No → 続行                                                   │
│     ↓                                                               │
│  4. /merge-coordinator queue                                        │
│     - マージキューに追加                                            │
│     - 依存関係を考慮                                                │
│     ↓                                                               │
│  5. キュー処理                                                      │
│     - 順番が来たらマージ実行                                        │
│     - 依存PRの完了を待機                                            │
│     ↓                                                               │
│  6. /merge-coordinator merge                                        │
│     - マージ実行                                                    │
│     - ブランチ削除                                                  │
│     - 所有権解放                                                    │
│     ↓                                                               │
│  7. 後処理                                                          │
│     - 関連タスク更新                                                │
│     - 依存PRの通知                                                  │
│     - メトリクス記録                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 関連スキル

- `/git-workflow` - Gitワークフロー管理
- `/code-review` - コードレビュー
- `/file-lock` - ファイルロック管理
- `/conductor` - コンダクター統括

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
| AOD_MERGE_STRATEGY | デフォルトマージ戦略 | squash |
| AOD_MERGE_DELETE_BRANCH | マージ後ブランチ削除 | true |
| AOD_MERGE_REQUIRED_APPROVALS | 必要承認数 | 1 |
