# AODを使った新規プロジェクト開発フロー

AI Orchestration Dashboard（AOD）を使ってマルチエージェント並列開発を行う際のワークフローガイド

---

## クイックスタート

```
1. AOD起動 → 2. プロジェクト登録 → 3. タスク分解 → 4. エージェント起動 → 5. 監視・調整
```

---

## Phase 1: 環境準備

### 1.1 AODサーバー起動

```powershell
# バックエンド（WSL経由）
wsl -e bash -c 'cd /mnt/c/path/to/ai-orchestration-dashboard/server && ~/.bun/bin/bun run src/index.ts'

# フロントエンド
cd frontend
$env:PORT=3002; npm run dev
```

### 1.2 ダッシュボードアクセス

- **フロントエンド**: http://localhost:3002
- **API**: http://localhost:4000

---

## Phase 2: プロジェクト登録

### 2.1 新規プロジェクト作成

ダッシュボードまたはAPIで登録：

```bash
POST /api/projects
{
  "name": "新規プロジェクト名",
  "description": "プロジェクトの説明",
  "planned_start": "2026-01-20",
  "planned_end": "2026-02-20"
}
```

### 2.2 WBS（作業分解構造）定義

大きなタスクを細かく分解して登録：

```
プロジェクト
├── Phase 1: 設計
│   ├── 1.1 要件定義
│   └── 1.2 アーキテクチャ設計
├── Phase 2: 実装
│   ├── 2.1 バックエンド開発
│   ├── 2.2 フロントエンド開発
│   └── 2.3 テスト実装
└── Phase 3: 検証
    └── 3.1 統合テスト
```

---

## Phase 3: エージェント設定

### 3.1 エージェント登録

各Claude Codeセッションをエージェントとして登録：

```bash
POST /api/agents
{
  "name": "Backend Agent",
  "type": "developer",
  "capabilities": ["typescript", "backend", "api", "database"]
}
```

### 3.2 能力タグ設定

エージェントの得意分野を設定（マッチングに使用）：

| カテゴリ | タグ例 |
|---------|--------|
| 言語 | `typescript`, `python`, `go` |
| フレームワーク | `react`, `nextjs`, `hono` |
| ドメイン | `api`, `database`, `testing` |
| ツール | `git`, `docker`, `ci-cd` |

---

## Phase 4: タスクキュー投入

### 4.1 タスク登録

```bash
POST /api/queue/enqueue
{
  "project_id": "proj_xxx",
  "title": "認証APIの実装",
  "description": "JWT認証のエンドポイント実装",
  "priority": 0,  # 0=最高, 1=高, 2=中
  "required_capabilities": ["typescript", "backend", "authentication"],
  "estimated_minutes": 120
}
```

### 4.2 優先度設定

| 優先度 | 値 | 用途 |
|--------|---|------|
| P0 (Critical) | 0 | ブロッカー、緊急対応 |
| P1 (High) | 1 | 主要機能 |
| P2 (Medium) | 2 | 通常タスク |
| P3 (Low) | 3 | 改善・リファクタ |

---

## Phase 5: 並列開発実行

### 5.1 エージェント起動

複数のClaude Codeセッションを起動し、それぞれにタスクを割り当て：

```
Terminal 1: Backend Agent   → 認証API実装
Terminal 2: Frontend Agent  → ログインUI実装
Terminal 3: Test Agent      → E2Eテスト作成
```

### 5.2 ファイルロック確認

同じファイルを複数エージェントが編集しないよう確認：

```bash
GET /api/locks/list?project_id=proj_xxx
```

### 5.3 進捗報告

各エージェントは定期的に進捗を報告：

```bash
# セッション開始
POST /api/sessions { "agent_id": "agent_xxx", "project_id": "proj_xxx" }

# イベント記録
POST /api/events { "session_id": "...", "type": "tool_use", ... }
```

---

## Phase 6: 監視・調整

### 6.1 ダッシュボードで監視

- **Event Timeline**: リアルタイムのエージェント活動
- **Sessions**: 各セッションの状態
- **Task Queue**: タスクの進捗状況

### 6.2 ボトルネック対応

遅延や問題が発生した場合：

1. タスクの優先度変更
2. 別エージェントへの再割り当て
3. 依存関係の調整

### 6.3 共有コンテキスト活用

エージェント間で知識を共有：

```bash
POST /api/context
{
  "project_id": "proj_xxx",
  "context_type": "decision",
  "title": "認証方式決定",
  "content": "JWT + RefreshTokenを採用"
}
```

---

## Phase 7: 完了・振り返り

### 7.1 マイルストーン記録

```bash
POST /api/milestones
{
  "project_id": "proj_xxx",
  "title": "Phase 1 完了",
  "type": "checkpoint",
  "evidence": "全APIエンドポイント実装完了",
  "lessons_learned": "..."
}
```

### 7.2 メトリクス確認

- 完了タスク数
- 平均完了時間
- エージェント稼働率

---

## Tips

### ベストプラクティス

1. **タスクは小さく分割** - 1-2時間で完了できる粒度
2. **依存関係を明確に** - 並列実行可能なタスクを識別
3. **ファイルロックを活用** - 競合を事前に防止
4. **共有コンテキストを更新** - 学んだことを共有

### トラブルシューティング

| 問題 | 対処 |
|------|------|
| 接続エラー | バックエンド/フロントエンドの起動確認 |
| CORS エラー | ポート設定確認（3000/3002許可） |
| ファイル競合 | ロック状態確認、必要なら強制解放 |

---

## API リファレンス

| エンドポイント | 用途 |
|---------------|------|
| `GET /api/projects` | プロジェクト一覧 |
| `POST /api/queue/enqueue` | タスク登録 |
| `GET /api/queue/stats` | キュー統計 |
| `GET /api/agents` | エージェント一覧 |
| `POST /api/locks/acquire` | ファイルロック取得 |
| `GET /api/context` | 共有コンテキスト取得 |

詳細は [PLAN-2026-005_マルチエージェント並列開発拡張計画書.md](file:///c:/Users/zeroz/Projects/ai-orchestration-dashboard/docs/PLAN-2026-005_マルチエージェント並列開発拡張計画書.md) を参照
