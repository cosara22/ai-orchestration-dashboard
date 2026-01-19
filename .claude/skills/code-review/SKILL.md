---
name: code-review
description: |
  コードレビュー管理スキル。マルチエージェント環境でのコードレビューを支援:
  (1) 自動コードレビューの実行
  (2) レビューコメントの投稿
  (3) レビュー承認・却下
  (4) レビュー指摘の追跡
  (5) レビューメトリクスの収集
  重要: PRマージ前に必ずコードレビューを実施すること
user_invocable: true
version: 1.0.0
---

# Code Review Skill

マルチエージェント並列開発におけるコードレビュー管理を行います。

## 使用方法

```
/code-review [command] [options]
```

### Commands

| Command | 説明 | 例 |
|---------|------|-----|
| `review` | レビュー実行 | `/code-review review --pr=123` |
| `comment` | コメント投稿 | `/code-review comment --pr=123 --file=src/auth.ts` |
| `approve` | 承認 | `/code-review approve --pr=123` |
| `request-changes` | 変更要求 | `/code-review request-changes --pr=123` |
| `resolve` | 指摘解決 | `/code-review resolve --comment=cmt_xxx` |
| `status` | レビュー状態確認 | `/code-review status --pr=123` |
| `metrics` | レビューメトリクス | `/code-review metrics` |

## レビューカテゴリ

| カテゴリ | 説明 | 重要度 |
|---------|------|--------|
| `security` | セキュリティ問題 | Critical |
| `bug` | 潜在的バグ | High |
| `performance` | パフォーマンス問題 | Medium |
| `style` | コードスタイル | Low |
| `documentation` | ドキュメント不足 | Low |
| `architecture` | 設計上の問題 | Medium |
| `testing` | テスト不足 | Medium |
| `suggestion` | 改善提案 | Low |

## レビュー重要度

| 重要度 | 説明 | マージブロック |
|--------|------|---------------|
| `critical` | 必須対応 | Yes |
| `major` | 強く推奨 | Yes |
| `minor` | 推奨 | No |
| `nitpick` | 細かい指摘 | No |

## API エンドポイント

### POST /api/review/analyze

PRの自動レビューを実行します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "pr_number": "required - PR番号",
  "agent_id": "required - レビュアーエージェントID",
  "review_scope": {
    "check_security": true,
    "check_performance": true,
    "check_style": true,
    "check_tests": true,
    "check_documentation": true
  },
  "context": "optional - 追加コンテキスト"
}
```

**Response**:
```json
{
  "review_id": "rev_xxx",
  "pr_number": 123,
  "overall_status": "changes_requested",
  "summary": {
    "files_reviewed": 8,
    "total_issues": 12,
    "critical": 1,
    "major": 3,
    "minor": 5,
    "nitpick": 3
  },
  "issues": [
    {
      "issue_id": "iss_xxx",
      "file": "src/auth/jwt.ts",
      "line": 45,
      "category": "security",
      "severity": "critical",
      "title": "ハードコードされたシークレット",
      "description": "JWTシークレットがハードコードされています。環境変数を使用してください。",
      "suggestion": "const secret = process.env.JWT_SECRET;",
      "code_snippet": "const secret = 'hardcoded-secret-123';",
      "auto_fixable": true
    },
    {
      "issue_id": "iss_yyy",
      "file": "src/auth/jwt.ts",
      "line": 78,
      "category": "bug",
      "severity": "major",
      "title": "トークン有効期限の検証漏れ",
      "description": "トークンの有効期限を検証していません。期限切れトークンが受け入れられる可能性があります。",
      "suggestion": "if (decoded.exp < Date.now() / 1000) { throw new Error('Token expired'); }",
      "auto_fixable": false
    }
  ],
  "positive_feedback": [
    {
      "file": "src/auth/types.ts",
      "comment": "型定義が明確で、良い設計です。"
    }
  ],
  "test_coverage": {
    "new_code_coverage": 75,
    "suggestion": "認証エラーケースのテストを追加することを推奨"
  },
  "created_at": "2026-01-19T16:00:00Z"
}
```

### POST /api/review/comment

レビューコメントを投稿します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "pr_number": "required - PR番号",
  "agent_id": "required - レビュアーエージェントID",
  "file": "required - ファイルパス",
  "line": "required - 行番号",
  "body": "required - コメント本文",
  "category": "optional - カテゴリ",
  "severity": "optional - 重要度",
  "suggestion": "optional - 修正提案コード"
}
```

**Response**:
```json
{
  "comment_id": "cmt_xxx",
  "pr_number": 123,
  "file": "src/auth/jwt.ts",
  "line": 45,
  "body": "ハードコードされたシークレットは危険です。",
  "posted_at": "2026-01-19T16:05:00Z"
}
```

### POST /api/review/submit

レビューを提出します。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "pr_number": "required - PR番号",
  "agent_id": "required - レビュアーエージェントID",
  "decision": "required - approve/request_changes/comment",
  "summary": "optional - レビューサマリー",
  "blocking_issues": ["optional - ブロックしている問題ID"]
}
```

**Response**:
```json
{
  "review_id": "rev_xxx",
  "pr_number": 123,
  "decision": "request_changes",
  "summary": "セキュリティ上の問題が1件あります。修正後に再レビューをリクエストしてください。",
  "submitted_at": "2026-01-19T16:10:00Z"
}
```

### POST /api/review/resolve

レビュー指摘を解決済みにします。

**Request Body**:
```json
{
  "project_id": "required - プロジェクトID",
  "comment_id": "required - コメントID",
  "agent_id": "required - 解決したエージェントID",
  "resolution": "optional - 解決方法の説明"
}
```

### GET /api/review/status/:pr_number

PRのレビュー状態を取得します。

**Response**:
```json
{
  "pr_number": 123,
  "title": "feat: Add JWT authentication",
  "author_agent_id": "agent_xxx",
  "author_name": "Backend Agent",
  "reviews": [
    {
      "review_id": "rev_xxx",
      "reviewer_agent_id": "agent_yyy",
      "reviewer_name": "Security Agent",
      "decision": "request_changes",
      "issues_raised": 3,
      "issues_resolved": 1,
      "submitted_at": "2026-01-19T16:10:00Z"
    },
    {
      "review_id": "rev_yyy",
      "reviewer_agent_id": "agent_zzz",
      "reviewer_name": "Frontend Agent",
      "decision": "approved",
      "issues_raised": 2,
      "issues_resolved": 2,
      "submitted_at": "2026-01-19T17:00:00Z"
    }
  ],
  "overall_status": "changes_requested",
  "blocking_issues": [
    {
      "issue_id": "iss_xxx",
      "title": "ハードコードされたシークレット",
      "severity": "critical",
      "status": "open"
    }
  ],
  "mergeable": false,
  "required_approvals": 2,
  "current_approvals": 1
}
```

### GET /api/review/metrics

レビューメトリクスを取得します。

**Query Parameters**:
- `project_id` - プロジェクトID（必須）
- `period` - 期間（optional: day, week, month）
- `agent_id` - エージェントフィルタ（optional）

**Response**:
```json
{
  "period": "week",
  "metrics": {
    "total_reviews": 25,
    "average_review_time_minutes": 45,
    "issues_found": 78,
    "issues_by_category": {
      "security": 5,
      "bug": 15,
      "performance": 8,
      "style": 30,
      "testing": 12,
      "documentation": 8
    },
    "issues_by_severity": {
      "critical": 2,
      "major": 18,
      "minor": 35,
      "nitpick": 23
    },
    "approval_rate": 0.72,
    "average_iterations": 1.8
  },
  "top_reviewers": [
    {
      "agent_id": "agent_xxx",
      "agent_name": "Security Agent",
      "reviews_completed": 12,
      "issues_found": 45,
      "average_time_minutes": 30
    }
  ],
  "common_issues": [
    {
      "pattern": "missing_error_handling",
      "count": 15,
      "suggestion": "エラーハンドリングのガイドラインを共有"
    }
  ]
}
```

## 使用例

### PRの自動レビュー

```bash
/code-review review --pr=123
```

実行内容:
1. PRの変更ファイルを取得
2. 各ファイルをカテゴリ別にレビュー
3. 問題を検出してコメント投稿
4. レビュー結果をサマリーで返却

### レビュー指摘への対応

```bash
# 指摘を確認
/code-review status --pr=123

# コードを修正
# ... ファイル編集 ...

# 指摘を解決済みに
/code-review resolve --comment=cmt_xxx --resolution="環境変数に変更しました"
```

### 再レビューリクエスト

```bash
# 修正をプッシュ後
/git-workflow push

# 再レビューをリクエスト
/code-review request-rereview --pr=123
```

## 自動レビューチェック項目

### セキュリティ

| チェック | 説明 |
|----------|------|
| ハードコードされたシークレット | APIキー、パスワード等 |
| SQLインジェクション | 未サニタイズの入力 |
| XSS | エスケープされていない出力 |
| 認証バイパス | 認証チェック漏れ |
| 権限昇格 | 不適切な権限チェック |

### バグ

| チェック | 説明 |
|----------|------|
| nullチェック漏れ | null/undefined参照 |
| 型の不一致 | TypeScriptの型エラー |
| 例外処理漏れ | try-catch不足 |
| 無限ループ | ループ終了条件 |
| メモリリーク | リソース解放漏れ |

### パフォーマンス

| チェック | 説明 |
|----------|------|
| N+1クエリ | ループ内クエリ |
| 大量データ処理 | ページネーション不足 |
| 不要な再レンダリング | React最適化 |
| 同期的重処理 | 非同期化推奨 |

### スタイル

| チェック | 説明 |
|----------|------|
| 命名規則 | camelCase, PascalCase等 |
| ファイル構造 | インポート順序等 |
| コメント | 不要/過剰なコメント |
| コード重複 | DRY違反 |

## レビューテンプレート

### 問題指摘

```markdown
### 🔴 [severity] [category]: [title]

**ファイル**: `path/to/file.ts` (行 45)

**問題**:
[問題の説明]

**現在のコード**:
```typescript
// 問題のあるコード
```

**推奨する修正**:
```typescript
// 修正後のコード
```

**理由**:
[なぜこの変更が必要か]
```

### 承認コメント

```markdown
### ✅ Approved

良い実装です！

**良い点**:
- [良い点1]
- [良い点2]

**提案（オプション）**:
- [改善提案]
```

## WebSocket通知

| イベント | 発生タイミング |
|---------|---------------|
| `review:started` | レビュー開始 |
| `review:completed` | レビュー完了 |
| `review:comment_added` | コメント追加 |
| `review:approved` | 承認 |
| `review:changes_requested` | 変更要求 |
| `review:issue_resolved` | 指摘解決 |

## レビューワークフロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Review Workflow                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. PR作成                                                          │
│     ↓                                                               │
│  2. 自動レビュー実行                                                │
│     - セキュリティチェック                                          │
│     - バグ検出                                                      │
│     - スタイルチェック                                              │
│     ↓                                                               │
│  3. レビュー結果                                                    │
│     ├── Critical/Major問題あり → 変更要求                          │
│     └── 問題なし/Minor以下 → 承認候補                              │
│     ↓                                                               │
│  4. 問題修正                                                        │
│     - コード修正                                                    │
│     - 指摘を解決済みに                                              │
│     ↓                                                               │
│  5. 再レビュー                                                      │
│     ↓                                                               │
│  6. 承認                                                            │
│     - 必要承認数を満たす                                            │
│     ↓                                                               │
│  7. マージ可能                                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 関連スキル

- `/git-workflow` - Gitワークフロー管理
- `/merge-coordinator` - マージ調整
- `/shared-context` - 共有コンテキスト
- `/conductor` - コンダクター統括

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_AGENT_ID | エージェントID | 自動検出 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
| AOD_REVIEW_AUTO | 自動レビュー有効化 | true |
| AOD_REVIEW_REQUIRED_APPROVALS | 必要承認数 | 1 |
