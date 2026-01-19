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

## 重要なスキル

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
