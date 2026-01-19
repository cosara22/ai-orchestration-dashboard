# 複数プロジェクト並列開発ガイド

AODダッシュボードと複数のClaude Codeターミナルを使った組織的な開発体制

---

## 全体構成図

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AOD Dashboard (http://localhost:3002)                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ プロジェクト切替: [Project A ▼] [Project B] [Project C]                ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ Task Queue | Agent Monitor | File Locks | Shared Context               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
        │ Project A     │ │ Project B     │ │ Project C     │
        │ (Web App)     │ │ (Mobile API)  │ │ (ML Pipeline) │
        └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
                │                 │                 │
        ┌───────┴───────┐ ┌───────┴───────┐ ┌───────┴───────┐
        │Terminal 1 & 2 │ │Terminal 3 & 4 │ │Terminal 5     │
        │(Claude Code)  │ │(Claude Code)  │ │(Claude Code)  │
        └───────────────┘ └───────────────┘ └───────────────┘
```

---

## ディレクトリ構成

### 推奨構成

```
C:\Users\{user}\Projects\
│
├── ai-orchestration-dashboard/    # AOD本体（常駐サービス）
│   ├── server/                    # バックエンドAPI (port 4000)
│   ├── frontend/                  # ダッシュボードUI (port 3002)
│   └── data/
│       └── aod.db                 # 全プロジェクトの統合DB
│
├── project-a-webapp/              # プロジェクトA
│   ├── .claude/
│   │   └── hooks/                 # AOD連携Hooks
│   ├── frontend/
│   ├── backend/
│   └── CLAUDE.md
│
├── project-b-mobile-api/          # プロジェクトB
│   ├── .claude/
│   │   └── hooks/
│   ├── src/
│   └── CLAUDE.md
│
└── project-c-ml-pipeline/         # プロジェクトC
    ├── .claude/
    │   └── hooks/
    ├── pipelines/
    └── CLAUDE.md
```

### 各ディレクトリの役割

| ディレクトリ | 役割 |
|-------------|------|
| `ai-orchestration-dashboard/` | 統合監視・タスク管理の中央サーバー |
| `project-*/` | 個別プロジェクトのソースコード |
| `.claude/hooks/` | AODとの連携スクリプト（セッション報告、ロック確認等） |
| `CLAUDE.md` | プロジェクト固有の指示・コンテキスト |

---

## ターミナル（Claude Code）の配置

### プロジェクト単位の配置例

```
┌──────────────────────────────────────────────────────────────────┐
│ ターミナル配置                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Terminal 1      │  │ Terminal 2      │  │ Terminal 3      │  │
│  │ [Project A]     │  │ [Project A]     │  │ [Project B]     │  │
│  │ Backend Agent   │  │ Frontend Agent  │  │ API Agent       │  │
│  │ cwd: project-a/ │  │ cwd: project-a/ │  │ cwd: project-b/ │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Terminal 4      │  │ Terminal 5      │  │ AOD Dashboard   │  │
│  │ [Project B]     │  │ [Project C]     │  │ http://3002     │  │
│  │ Test Agent      │  │ ML Agent        │  │ 全体監視        │  │
│  │ cwd: project-b/ │  │ cwd: project-c/ │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### エージェント識別の命名規則

```
{プロジェクト略称}-{役割}-{番号}

例:
- prjA-backend-01    # Project A のバックエンド担当
- prjA-frontend-01   # Project A のフロントエンド担当
- prjB-api-01        # Project B のAPI担当
- prjC-ml-01         # Project C のML担当
```

---

## AODとの連携フロー

### 1. セッション開始時

各ターミナル起動時にAODへ登録：

```bash
# .claude/hooks/session_start.py
POST http://localhost:4000/api/sessions
{
  "agent_id": "prjA-backend-01",
  "project_id": "project-a",
  "working_directory": "/path/to/project-a"
}
```

### 2. タスク取得

AODから自分に割り当てられたタスクを取得：

```bash
GET http://localhost:4000/api/queue/list?assigned_to=prjA-backend-01&status=assigned
```

### 3. ファイル編集前

ロック確認・取得：

```bash
# .claude/hooks/pre_edit.py
POST http://localhost:4000/api/locks/acquire
{
  "project_id": "project-a",
  "file_path": "src/auth/jwt.ts",
  "agent_id": "prjA-backend-01"
}
```

### 4. 進捗報告

定期的にAODへ報告：

```bash
POST http://localhost:4000/api/events
{
  "session_id": "sess_xxx",
  "type": "status_update",
  "message": "認証API 70%完了"
}
```

### 5. コンテキスト共有

学んだこと・決定事項を共有：

```bash
POST http://localhost:4000/api/context
{
  "project_id": "project-a",
  "context_type": "decision",
  "title": "認証トークン有効期限",
  "content": "アクセストークン: 15分、リフレッシュトークン: 7日"
}
```

---

## プロジェクト間の隔離と共有

### 隔離されるもの

| 項目 | 説明 |
|------|------|
| ソースコード | 各プロジェクトディレクトリ内で独立 |
| ファイルロック | project_id でスコープ |
| タスクキュー | project_id でフィルタ |
| 共有コンテキスト | project_id でフィルタ |

### 共有されるもの

| 項目 | 説明 |
|------|------|
| AODダッシュボード | 全プロジェクトを一覧表示 |
| エージェント登録 | 同一エージェントが複数プロジェクトに参加可能 |
| 能力タグマスター | 共通の能力タグ定義 |

---

## 運用パターン

### パターン1: 専任チーム

各プロジェクトに専任エージェントを配置：

```
Project A: Terminal 1, 2 (専任)
Project B: Terminal 3, 4 (専任)
Project C: Terminal 5    (専任)
```

**メリット**: コンテキストスイッチが少ない
**デメリット**: リソースの柔軟性が低い

### パターン2: フローティング

エージェントが複数プロジェクトを担当：

```
Terminal 1: Project A (午前) → Project B (午後)
Terminal 2: Project A, B, C (タスク優先度で切替)
```

**メリット**: リソース効率が高い
**デメリット**: コンテキスト管理が複雑

### パターン3: ハイブリッド

重要プロジェクトは専任、他はフローティング：

```
Terminal 1, 2: Project A (専任 - 重要)
Terminal 3, 4: Project B, C (フローティング)
```

---

## ダッシュボードでの監視

### プロジェクト切替

ダッシュボード上部のドロップダウンでプロジェクトを切替：

```
[All Projects ▼]
├── All Projects     # 全体表示
├── Project A        # Project A のみ
├── Project B        # Project B のみ
└── Project C        # Project C のみ
```

### クロスプロジェクト表示

「All Projects」選択時に全プロジェクトのタスク・エージェントを一覧表示：

| エージェント | プロジェクト | 現在のタスク | 状態 |
|-------------|-------------|-------------|------|
| prjA-backend-01 | Project A | 認証API実装 | 作業中 |
| prjA-frontend-01 | Project A | ログインUI | 作業中 |
| prjB-api-01 | Project B | エンドポイント設計 | 待機中 |

---

## まとめ

```
1. AODは中央の監視・調整ハブとして常駐
2. 各プロジェクトは独立したディレクトリで管理
3. Claude Codeターミナルはプロジェクト単位で起動
4. AODのAPI経由でタスク取得・進捗報告・ロック管理
5. ダッシュボードでプロジェクト横断の監視が可能
```
