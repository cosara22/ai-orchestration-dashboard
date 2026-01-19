# AI Orchestration Dashboard (AOD)

Claude Codeによる開発作業を可視化・管理するダッシュボードシステム。

## プロジェクト概要

- **Backend**: Bun + Hono (ポート4000)
- **Frontend**: Next.js 15 (ポート3002)
- **Database**: SQLite (WALモード)
- **リアルタイム通信**: WebSocket

## 開発環境

```bash
# サーバー起動
cd server && bun run dev

# フロントエンド起動
cd frontend && npm run dev
```

## スキル一覧

### 基本スキル

| スキル | 説明 | 使用タイミング |
|--------|------|---------------|
| `/record-milestone` | マイルストーン記録 | セッション終了時、コミット後、タスク完了時 |
| `/aod-setup` | AOD構築ガイド | セットアップや設定の質問時 |

### マルチエージェント並列開発スキル

| スキル | 説明 | 主な機能 |
|--------|------|---------|
| `/task-queue` | タスクキュー管理 | タスクの追加・割り当て・完了報告 |
| `/agent-capability` | エージェント能力管理 | スキル登録・マッチング・推薦 |
| `/file-lock` | ファイルロック管理 | ロック取得・解放・競合防止 |
| `/conductor` | コンダクター統括 | 全体監視・タスク分解・リソース調整 |
| `/shared-context` | 共有コンテキスト | 決定事項・ブロッカー・学習内容の共有 |
| `/agent-health` | エージェント監視 | ハートビート・異常検出・回復 |

### Git・コードレビュースキル

| スキル | 説明 | 主な機能 |
|--------|------|---------|
| `/git-workflow` | Gitワークフロー | ブランチ管理・所有権・PR作成 |
| `/code-review` | コードレビュー | 自動レビュー・指摘追跡・承認 |
| `/merge-coordinator` | マージ調整 | 競合解決・マージキュー・リリース |

### /record-milestone - マイルストーン記録

**このスキルは以下のタイミングで必ず呼び出すこと:**

1. **セッション終了時** - 作業内容をまとめて記録
2. **コミット完了後** - 重要なコミットを記録
3. **タスク完了時** - 完了したタスクを記録
4. **フェーズ完了時** - フェーズの成果を記録

```bash
# 使用例
/record-milestone session_end
/record-milestone commit
/record-milestone task_complete
/record-milestone phase_complete
```

詳細: `.claude/skills/record-milestone/SKILL.md`

### マルチエージェント作業フロー

```
1. タスク受領
   /task-queue claim --id=xxx
   /shared-context for-me

2. 開発準備
   /git-workflow branch --name=feat/xxx
   /file-lock acquire --file=xxx

3. 開発作業
   （コード実装）
   /shared-context post --type=decision

4. コミット・PR
   /git-workflow commit
   /git-workflow pr

5. レビュー・マージ
   /code-review review
   /merge-coordinator merge

6. 完了報告
   /task-queue complete
   /record-milestone task_complete
```

## API エンドポイント

### イベント管理
- `GET /api/events` - イベント一覧取得
- `POST /api/events` - イベント登録

### セッション管理
- `GET /api/sessions` - セッション一覧
- `GET /api/sessions/:id` - セッション詳細

### CCPM/WBS
- `GET /api/ccpm/projects` - プロジェクト一覧
- `GET /api/ccpm/projects/:id/wbs` - WBS取得
- `POST /api/ccpm/projects/:id/wbs` - WBS追加

### マイルストーン
- `GET /api/milestones` - マイルストーン一覧
- `POST /api/milestones/agent/record` - AI自動記録
- `POST /api/milestones/agent/progress` - 進捗記録
- `GET /api/milestones/agent/context/:projectId` - コンテキスト取得

### ドキュメント解析
- `POST /api/docs/parse` - ドキュメント解析
- `POST /api/docs/scan` - ディレクトリスキャン

## ディレクトリ構造

```
ai-orchestration-dashboard/
├── frontend/           # Next.js フロントエンド
├── server/             # Bun + Hono バックエンド
├── hooks/              # Claude Code Hooks スクリプト
├── data/               # SQLite データベース
├── docs/               # プロジェクトドキュメント
└── .claude/
    ├── settings.json   # Hooks設定
    ├── skills/         # カスタムスキル
    └── agents/         # カスタムエージェント
```

## Hooks設定

`.claude/settings.json` でHooksが設定されています:
- `PreToolUse` / `PostToolUse` - ツール使用イベント送信
- `Notification` - 通知イベント送信
- `Stop` - 停止イベント送信

## コーディング規約

- TypeScript strict mode
- ESLint + Prettier
- 日本語コメント可
- APIレスポンスは必ず型定義

## 注意事項

1. **セッション終了前に `/record-milestone session_end` を実行**
2. 重要なコミット後は `/record-milestone commit` で記録
3. WebSocketはポート4000の `/ws` エンドポイント
4. 認証はX-API-Keyヘッダー（環境変数 `AOD_API_KEY` で設定時のみ有効）
