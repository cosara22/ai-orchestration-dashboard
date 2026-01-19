---
name: record-milestone
description: |
  マイルストーンを自動記録するスキル。以下のタイミングで呼び出す:
  (1) セッション終了時 - 作業内容をまとめて記録
  (2) コミット完了後 - コミット内容を記録
  (3) タスク完了時 - 完了したタスクを記録
  (4) フェーズ完了時 - フェーズの成果を記録
  重要: このスキルはセッション終了前、コミット後、重要なタスク完了時に必ず呼び出すこと
user_invocable: true
version: 1.0.0
---

# Record Milestone Skill

開発の進捗をマイルストーンとして記録し、セマンティックレコードを自動生成します。

## 使用方法

```
/record-milestone [event_type] [options]
```

### Event Types

| Type | 説明 | 使用タイミング |
|------|------|---------------|
| `session_end` | セッション終了 | 作業セッションの終了時 |
| `commit` | コミット記録 | git commit完了後 |
| `task_complete` | タスク完了 | 主要タスクの完了時 |
| `phase_complete` | フェーズ完了 | プロジェクトフェーズの完了時 |

## 記録手順

### 1. セッション終了時 (`session_end`)

セッション終了前に必ず呼び出してください。以下の情報を収集して記録します:

1. **作業サマリー**: このセッションで何を達成したか
2. **変更ファイル**: 変更されたファイル一覧
3. **コミット履歴**: セッション中のコミット
4. **次のステップ**: 残りのタスクや次にやるべきこと
5. **学んだこと**: 問題解決のコツや発見など

**記録例**:
```json
{
  "project_id": "<project_id>",
  "event_type": "session_end",
  "title": "CCPM機能の実装完了",
  "summary": "ガントチャート、ドキュメント解析、マイルストーンAPIを実装",
  "files_changed": ["frontend/src/components/GanttChart.tsx", "..."],
  "commits": ["abc1234 feat: Add Gantt chart", "..."],
  "next_steps": ["UI統合テスト", "本番デプロイ"],
  "lessons_learned": "React 19ではgantt-task-reactが動かないため自作SVGで対応",
  "outcome": "success"
}
```

### 2. コミット完了後 (`commit`)

重要なコミット後に記録します:

```json
{
  "project_id": "<project_id>",
  "event_type": "commit",
  "title": "feat: Add user authentication",
  "description": "JWT認証とセッション管理を実装",
  "commits": ["def5678 feat: Add user authentication"],
  "files_changed": ["src/auth/...", "..."]
}
```

### 3. タスク完了時 (`task_complete`)

主要なタスクが完了したら記録します:

```json
{
  "project_id": "<project_id>",
  "event_type": "task_complete",
  "title": "検索機能の実装完了",
  "summary": "全文検索とフィルタリングを実装",
  "wbs_id": "wbs_xxx",  // 関連するWBS項目があれば
  "next_steps": ["パフォーマンステスト", "インデックス最適化"],
  "outcome": "success"
}
```

### 4. フェーズ完了時 (`phase_complete`)

プロジェクトの主要フェーズが完了したら記録します:

```json
{
  "project_id": "<project_id>",
  "event_type": "phase_complete",
  "title": "Phase 2: 基本機能実装完了",
  "summary": "イベント管理、セッション追跡、リアルタイム更新を実装",
  "files_changed": ["多数"],
  "commits": ["コミット一覧"],
  "next_steps": ["Phase 3: CCPM/WBS機能"],
  "lessons_learned": "WebSocket接続の安定性向上が重要",
  "outcome": "success"
}
```

## API エンドポイント

### POST /api/milestones/agent/record

マイルストーンを記録します。

**Request Body**:
```json
{
  "session_id": "optional",
  "project_id": "required",
  "event_type": "session_end | commit | task_complete | phase_complete",
  "title": "required",
  "description": "optional",
  "summary": "optional - AI生成サマリー",
  "files_changed": ["optional - ファイルパス配列"],
  "commits": ["optional - コミット一覧"],
  "tools_used": ["optional - 使用したツール"],
  "duration_minutes": "optional - 作業時間",
  "outcome": "success | partial | blocked",
  "next_steps": ["optional - 次のステップ配列"],
  "lessons_learned": "optional",
  "tags": ["optional - タグ配列"],
  "wbs_id": "optional - 関連WBS"
}
```

**Response**:
```json
{
  "milestone_id": "ms_xxx",
  "record_id": "sr_xxx",
  "status": "achieved | in_progress | pending",
  "report": "# Milestone Report: ...\n\n生成されたMarkdownレポート"
}
```

### POST /api/milestones/agent/progress

進捗を記録します（マイルストーン作成なし）。

**Request Body**:
```json
{
  "project_id": "required",
  "progress_type": "task_start | task_progress | task_complete | blocker",
  "task_title": "optional",
  "details": "optional",
  "percent_complete": "optional - 0-100",
  "blockers": ["optional - ブロッカー配列"],
  "wbs_id": "optional - WBS自動更新用"
}
```

### GET /api/milestones/agent/context/:projectId

現在のプロジェクト状況を取得します。

**Response**:
```json
{
  "project_id": "xxx",
  "recent_milestones": [...],
  "pending_actions": [...],
  "recent_progress": [...],
  "active_wbs_items": [...],
  "summary": {
    "total_milestones": 10,
    "achieved": 8,
    "pending_actions_count": 5,
    "active_wbs_count": 2
  }
}
```

## 実装例

### curlでの呼び出し

```bash
# セッション終了記録
curl -X POST http://localhost:4000/api/milestones/agent/record \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "proj_xxx",
    "event_type": "session_end",
    "title": "認証機能の実装",
    "summary": "JWT認証を実装し、セッション管理を追加",
    "files_changed": ["src/auth/jwt.ts", "src/middleware/auth.ts"],
    "next_steps": ["テスト追加", "ドキュメント更新"],
    "outcome": "success"
  }'
```

### Pythonスクリプト

`hooks/record_milestone.py` を使用:

```bash
# セッション終了
echo '{"summary":"作業サマリー","next_steps":["次のタスク"]}' | python hooks/record_milestone.py session_end

# コミット記録
echo '{"commit_hash":"abc123","message":"feat: Add feature"}' | python hooks/record_milestone.py commit
```

## 自動記録のベストプラクティス

1. **セッション終了時は必ず記録**: 作業内容を失わないため
2. **重要なコミット後に記録**: 機能追加やバグ修正など
3. **タスク完了時に記録**: WBS項目の進捗も自動更新される
4. **フェーズ完了時は詳細に記録**: 次のフェーズへの引き継ぎ情報として重要

## 関連スキル・コマンド

- `/setup-dashboard` - AODセットアップ
- `aod-setup` - AOD構築に関する質問対応

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| AOD_URL | ダッシュボードURL | http://localhost:4000 |
| AOD_PROJECT_ID | プロジェクトID | 自動検出 |
