# AI Orchestration Dashboard - クイックスタートガイド

5分でマルチエージェント開発環境を構築する方法。

---

## 前提条件

- Docker & Docker Compose
- Claude Code CLI (`claude`)
- Python 3.x (Hooks用)

---

## Step 1: サービス起動 (2分)

### Option A: Docker (推奨)

```bash
# 開発モードで起動
docker compose -f docker-compose.dev.yml up -d

# または本番モードで起動
docker compose up -d
```

### Option B: ローカル起動

```bash
# ターミナル1: バックエンド
cd server && bun run dev

# ターミナル2: フロントエンド
cd frontend && npm run dev
```

### 確認

```bash
# APIヘルスチェック
curl http://localhost:4000/health

# ダッシュボードにアクセス
open http://localhost:3002
```

---

## Step 2: プロジェクト初期化 (1分)

```bash
# 新規プロジェクト作成
./scripts/init-project.sh --name "MyProject" --team-size 5

# または手動でAPI呼び出し
curl -X POST http://localhost:4000/api/teams \
  -H "Content-Type: application/json" \
  -d '{"name":"MyProject Team","project_id":"myproject"}'
```

---

## Step 3: エージェント起動 (2分)

各ターミナルで環境変数を設定してエージェントを起動。

### ターミナル1: コンダクター

```bash
export AOD_AGENT_ID="conductor-001"
export AOD_AGENT_NAME="Conductor"
export AOD_PROJECT_ID="myproject"
./agents/conductor/start.sh
# または
# claude --claude-md ./agents/conductor/CLAUDE.md
```

### ターミナル2: フロントエンド開発者

```bash
export AOD_AGENT_ID="frontend-001"
export AOD_AGENT_NAME="Frontend Dev"
export AOD_PROJECT_ID="myproject"
./agents/frontend-dev/start.sh
```

### ターミナル3: バックエンド開発者

```bash
export AOD_AGENT_ID="backend-001"
export AOD_AGENT_NAME="Backend Dev"
export AOD_PROJECT_ID="myproject"
./agents/backend-dev/start.sh
```

---

## Windows (PowerShell)

```powershell
# サービス起動
.\scripts\start-all.ps1

# エージェント起動
$env:AOD_AGENT_ID = "conductor-001"
$env:AOD_AGENT_NAME = "Conductor"
$env:AOD_PROJECT_ID = "myproject"
.\agents\conductor\start.ps1
```

---

## 動作確認

1. **ダッシュボード**: http://localhost:3002
   - 「Multi-Agent」タブをクリック
   - 「Monitoring」で登録エージェントを確認

2. **APIでエージェント確認**:
```bash
curl http://localhost:4000/api/agents
```

3. **タスク投入**:
```bash
curl -X POST http://localhost:4000/api/queue/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "myproject",
    "title": "Implement login page",
    "priority": 1,
    "required_capabilities": ["react", "typescript"]
  }'
```

---

## ディレクトリ構成

```
ai-orchestration-dashboard/
├── agents/                    # エージェントテンプレート
│   ├── conductor/             # 統括エージェント
│   ├── frontend-dev/          # FE開発者
│   ├── backend-dev/           # BE開発者
│   ├── tester/                # テスター
│   └── reviewer/              # レビュアー
├── scripts/                   # 起動スクリプト
│   ├── start-all.sh           # 全サービス起動
│   ├── start-all.ps1          # Windows用
│   └── init-project.sh        # プロジェクト初期化
├── server/                    # バックエンド
├── frontend/                  # フロントエンド
├── .claude/                   # Claude Code設定
│   ├── settings.json          # Hooks設定
│   └── hooks/                 # イベント送信スクリプト
└── docker-compose.yml         # Docker設定
```

---

## 次のステップ

1. **組織構築ガイド**: [GUIDE_組織構築.md](./GUIDE_組織構築.md)
2. **トラブルシューティング**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
3. **ベストプラクティス**: [BEST_PRACTICES.md](./BEST_PRACTICES.md)

---

## よくある質問

### Q: エージェントがダッシュボードに表示されない

A: 環境変数が正しく設定されているか確認:
```bash
echo $AOD_AGENT_ID
echo $AOD_API_URL
```

### Q: Hooksが動作しない

A: Python と必要なパッケージを確認:
```bash
python --version
python -c "import urllib.request; print('OK')"
```

### Q: ファイルロックが取れない

A: 期限切れロックをクリーンアップ:
```bash
curl -X POST http://localhost:4000/api/locks/cleanup
```
