# Phase 16 実装計画書

## 運用・開発準備 & AIエージェント組織構築

**作成日**: 2026-01-19
**目標**: 本番運用可能な環境構築とマルチエージェント組織のテンプレート化

---

## 進捗サマリー

```
Phase 16-A ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Docker Compose 本番環境構築

Phase 16-B ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    エージェント組織テンプレート

Phase 16-C ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    起動スクリプト & 自動化

Phase 16-D ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    クイックスタートガイド
```

---

## Phase 16-A: Docker Compose 本番環境構築

### タスク一覧

| ID | タスク | 内容 | ファイル |
|----|--------|------|----------|
| 16A-1 | Backend サービス追加 | Bun + Honoコンテナ | `docker-compose.yml` |
| 16A-2 | Frontend サービス追加 | Next.jsコンテナ | `docker-compose.yml` |
| 16A-3 | 本番用 docker-compose | プロダクション設定 | `docker-compose.prod.yml` |
| 16A-4 | 開発用 docker-compose | ホットリロード対応 | `docker-compose.dev.yml` |
| 16A-5 | Dockerfiles | 各サービスのDockerfile | `server/Dockerfile`, `frontend/Dockerfile` |
| 16A-6 | 環境変数テンプレート | .env.example完備 | `.env.example` |

### Docker構成

```yaml
services:
  redis:        # キャッシュ & Pub/Sub
  backend:      # Bun + Hono API (port 4000)
  frontend:     # Next.js Dashboard (port 3002)
  # Optional:
  prometheus:   # メトリクス収集
  grafana:      # 可視化
```

---

## Phase 16-B: エージェント組織テンプレート

### タスク一覧

| ID | タスク | 内容 | ファイル |
|----|--------|------|----------|
| 16B-1 | コンダクター設定 | 統括エージェント用プロファイル | `agents/conductor/` |
| 16B-2 | フロントエンド専門 | FE開発エージェント用 | `agents/frontend-dev/` |
| 16B-3 | バックエンド専門 | BE開発エージェント用 | `agents/backend-dev/` |
| 16B-4 | テスター専門 | QA/テストエージェント用 | `agents/tester/` |
| 16B-5 | ドキュメンター | ドキュメント作成専門 | `agents/documenter/` |
| 16B-6 | レビュアー | コードレビュー専門 | `agents/reviewer/` |

### エージェントプロファイル構成

```
agents/
├── conductor/
│   ├── CLAUDE.md           # システムプロンプト
│   ├── settings.json       # Hooks設定
│   └── start.sh            # 起動スクリプト
├── frontend-dev/
│   ├── CLAUDE.md
│   ├── settings.json
│   └── start.sh
├── backend-dev/
│   ├── CLAUDE.md
│   ├── settings.json
│   └── start.sh
└── ...
```

### 組織構造テンプレート

```
プロジェクトAlpha
├── Conductor (統括)
│   ├── タスク分解・割り当て
│   ├── 進捗監視
│   └── ボトルネック対応
├── Frontend Team
│   ├── FE-Dev-001
│   └── FE-Dev-002
├── Backend Team
│   ├── BE-Dev-001
│   └── BE-Dev-002
├── QA Team
│   └── Tester-001
└── Support
    ├── Reviewer-001
    └── Documenter-001
```

---

## Phase 16-C: 起動スクリプト & 自動化

### タスク一覧

| ID | タスク | 内容 | ファイル |
|----|--------|------|----------|
| 16C-1 | 一括起動スクリプト | 全サービス起動 | `scripts/start-all.sh` |
| 16C-2 | エージェント起動 | 複数エージェント起動 | `scripts/start-agents.sh` |
| 16C-3 | プロジェクト初期化 | 新規プロジェクトセットアップ | `scripts/init-project.sh` |
| 16C-4 | チーム作成スクリプト | チーム一括登録 | `scripts/create-team.sh` |
| 16C-5 | Windows対応 | PowerShellスクリプト | `scripts/*.ps1` |

### 起動フロー

```bash
# 1. インフラ起動
./scripts/start-all.sh

# 2. プロジェクト初期化
./scripts/init-project.sh --name "ProjectAlpha" --team-size 5

# 3. エージェント起動 (各ターミナルで)
./agents/conductor/start.sh
./agents/frontend-dev/start.sh
./agents/backend-dev/start.sh
```

---

## Phase 16-D: クイックスタートガイド

### タスク一覧

| ID | タスク | 内容 | ファイル |
|----|--------|------|----------|
| 16D-1 | 5分クイックスタート | 最小構成での起動 | `docs/QUICKSTART.md` |
| 16D-2 | 組織構築ガイド | チーム編成方法 | `docs/GUIDE_組織構築.md` |
| 16D-3 | トラブルシューティング | よくある問題と解決 | `docs/TROUBLESHOOTING.md` |
| 16D-4 | ベストプラクティス | 運用のコツ | `docs/BEST_PRACTICES.md` |

---

## 実装順序

### Wave 1: インフラ基盤 (16A)
1. Dockerfile作成 (backend, frontend)
2. docker-compose.yml拡張
3. 環境変数テンプレート

### Wave 2: エージェントテンプレート (16B)
1. コンダクター設定
2. 専門エージェント設定
3. CLAUDE.md作成

### Wave 3: 自動化 (16C)
1. 起動スクリプト
2. プロジェクト初期化
3. Windows対応

### Wave 4: ドキュメント (16D)
1. クイックスタート
2. 組織構築ガイド
3. トラブルシューティング

---

## 期待される成果

### 開発者体験
- `docker compose up` で全サービス起動
- 新規プロジェクトは1コマンドで初期化
- エージェントは設定済みプロファイルで即起動

### 運用
- 本番/開発環境の明確な分離
- ログ収集・監視の自動化
- スケーラブルなエージェント追加

### 組織構築
- 役割別エージェントテンプレート
- チーム編成の標準化
- 知識・能力の継承
