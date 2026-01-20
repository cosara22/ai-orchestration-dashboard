# Conductor エージェント運用マニュアル

Conductorエージェントと人間の協働フローについてのガイド。

---

## 目次

1. [全体像](#全体像)
2. [フェーズ別の人間の役割](#フェーズ別の人間の役割)
3. [エスカレーション対応](#エスカレーション対応)
4. [人間がやることチェックリスト](#人間がやることチェックリスト)
5. [よく使うコマンド・指示](#よく使うコマンド指示)
6. [ダッシュボード活用](#ダッシュボード活用)

---

## 全体像

### 役割分担

```
┌─────────────────────────────────────────────────────────────┐
│                        人間（あなた）                        │
│  - プロジェクト開始指示                                      │
│  - 重要な設計判断                                            │
│  - エスカレーション対応                                      │
│  - 最終承認・レビュー                                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ 指示・承認
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Conductor エージェント                     │
│  - タスク分解・割り当て                                      │
│  - 進捗監視・ボトルネック検出                                │
│  - 問題のエスカレーション                                    │
│  - サブエージェントの調整                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ 指示・監視
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              サブエージェント（Frontend, Backend等）          │
│  - 実際のコード実装                                          │
│  - テスト作成                                                │
│  - PR作成                                                   │
└─────────────────────────────────────────────────────────────┘
```

### 自動化されていること

| 機能 | 実行主体 | 間隔 |
|------|---------|------|
| タスク自動割り当て | バックエンドスケジューラー | 30秒 |
| エージェント健全性チェック | バックエンドスケジューラー | 1分 |
| タスクタイムアウト検出 | バックエンドスケジューラー | 5分 |
| 期限切れロック解放 | バックエンドスケジューラー | 1時間 |

### 人間が判断すべきこと

- プロジェクトの開始・終了
- 技術選択・設計判断
- 優先度の変更
- エスカレーションへの対応
- PRの最終承認

---

## フェーズ別の人間の役割

### フェーズ1: プロジェクト開始

#### Step 1: 環境起動

```powershell
# PowerShell (Windows)
.\scripts\start-all.ps1
```

```bash
# Bash (Linux/Mac)
./scripts/start-all.sh
```

#### Step 2: プロジェクト初期化

```bash
./scripts/init-project.sh --name "MyProject" --team-size 5
```

#### Step 3: Conductorエージェント起動

**Windows (PowerShell):**
```powershell
$env:AOD_PROJECT_ID="myproject"
.\agents\conductor\start.ps1
```

**Linux/Mac:**
```bash
export AOD_PROJECT_ID="myproject"
./agents/conductor/start.sh
```

#### Step 4: Conductorへの最初の指示

```
あなた:
「ユーザー認証機能を実装してください。

要件:
- メール/パスワードログイン
- JWT認証
- パスワードリセット機能

使用技術: Next.js, Hono, SQLite」
```

#### Conductorの応答例

```
Conductor:
「承知しました。タスクを分解します。

/conductor decompose で以下のサブタスクを作成しました:

1. [BE-001] 認証APIエンドポイント実装 (優先度: High)
   - 必要能力: typescript, hono, jwt

2. [BE-002] ユーザーDBスキーマ設計 (優先度: High)
   - 必要能力: sqlite, database

3. [FE-001] ログインフォーム実装 (優先度: Medium)
   - 必要能力: react, nextjs, tailwind
   - 依存: BE-001

4. [FE-002] パスワードリセット画面 (優先度: Low)
   - 必要能力: react, nextjs
   - 依存: BE-001

サブエージェントを起動しますか？」
```

#### Step 5: サブエージェント起動の承認

```
あなた: 「OK。Backend-devとFrontend-devを起動して進めて」
```

**別ターミナルでサブエージェント起動:**

```powershell
# Backend Developer
$env:AOD_PROJECT_ID="myproject"
$env:AOD_AGENT_ID="backend-dev-001"
.\agents\backend-dev\start.ps1

# Frontend Developer (さらに別ターミナル)
$env:AOD_PROJECT_ID="myproject"
$env:AOD_AGENT_ID="frontend-dev-001"
.\agents\frontend-dev\start.ps1
```

---

### フェーズ2: 開発中の監視

#### 人間がやること

**1. ダッシュボード確認**

ブラウザで http://localhost:3002 を開き:
- Multi-Agent > Task Queue でタスク進捗確認
- アラートパネルで問題の有無を確認

**2. 定期的なConductorへの確認（15-30分ごと）**

```
あなた: 「進捗どう？」
```

#### Conductorの報告例

```
Conductor:
「/conductor status で確認しました。

📊 進捗状況:
- 完了: 2/4 タスク (50%)
- 進行中: 1 タスク (BE-001: 認証API)
- 待機中: 1 タスク (FE-002: パスワードリセット)

👥 エージェント状態:
- backend-dev-001: 作業中 (BE-001)
- frontend-dev-001: 待機中 (依存待ち)

⚠️ 注意点:
- BE-001の完了待ちでFE-001がブロック中
- 予想完了: あと2時間程度

問題なく進んでいます。」
```

---

### フェーズ3: レビュー・承認

#### Conductorからの報告

```
Conductor:
「📋 レビュー依頼

BE-001の実装が完了しました。
- PR: #12 feat: Add authentication API
- 変更ファイル: 5ファイル, +320行

/code-review の結果:
- セキュリティ: ✅ OK
- パフォーマンス: ✅ OK
- コード品質: ⚠️ 1件の軽微な指摘

レビューして承認をお願いします。」
```

#### 人間のレビュー・承認

```
あなた: 「PR確認した。マージしてOK」
```

#### Conductorの対応

```
Conductor:
「/merge-coordinator merge でマージしました。

次のタスク FE-001 の依存が解消されました。
frontend-dev-001 に自動割り当て済みです。」
```

---

### フェーズ4: 完了・クロージング

#### Conductorからの完了報告

```
Conductor:
「🎉 全タスク完了

/conductor status:
- 完了: 4/4 タスク (100%)

成果物:
- PR #12: 認証API (マージ済み)
- PR #13: ログインUI (マージ済み)
- PR #14: パスワードリセット (マージ済み)

テスト結果: 全て通過 ✅

/record-milestone phase_complete で記録しました。

次のフェーズの指示をお願いします。」
```

---

## エスカレーション対応

### エスカレーションの種類

| 種類 | 説明 | 対応例 |
|------|------|--------|
| 設計判断 | 技術選択が必要 | 「JWT認証で進めて」 |
| ブロッカー | 外部依存で停止 | 「一旦スキップして次へ」 |
| リソース不足 | エージェントが足りない | 「testerを追加して」 |
| 品質問題 | テスト失敗等 | 「リワークして」 |
| 競合 | ファイルロック競合 | 「BE-001を優先」 |

### エスカレーション例と対応

#### 例1: 設計判断が必要

```
Conductor:
「🚨 エスカレーション

/conductor escalate を実行しました。

問題: 外部認証サービスのAPI仕様が不明
- 影響タスク: BE-001
- 停滞時間: 45分

質問:
1. OAuth2.0を使用しますか？独自JWT認証のみにしますか？
2. リフレッシュトークンの有効期限は？

判断をお願いします。」
```

**人間の対応:**

```
あなた:
「独自JWT認証のみで進めて。
アクセストークン: 1時間
リフレッシュトークン: 7日間」
```

#### 例2: エージェント過負荷

```
Conductor:
「⚠️ ボトルネック検出

/conductor bottlenecks の結果:
- backend-dev-001 が過負荷 (3タスク担当中)
- 待機タスク: 2件

推奨アクション:
1. backend-dev を追加
2. タスク優先度を調整

どうしますか？」
```

**人間の対応:**

```
あなた: 「backend-dev-002を追加して」
```

#### 例3: テスト失敗

```
Conductor:
「🔴 品質問題

PR #13 のテストが失敗しています。
- 失敗: 3/20 テスト
- 原因: API応答形式の不一致

対応オプション:
1. リワーク指示
2. テストを修正
3. 一旦マージして後で修正

どうしますか？」
```

**人間の対応:**

```
あなた: 「リワークして。API応答形式を仕様通りに修正」
```

---

## 人間がやることチェックリスト

### 毎日のルーティン

| タイミング | やること | 所要時間 |
|-----------|---------|---------|
| 開始時 | ダッシュボードでアラート確認 | 2分 |
| 開始時 | Conductorに「進捗どう？」と確認 | 5分 |
| 随時 | エスカレーションへの判断・回答 | 都度 |
| 終了時 | PR確認・承認 | 10-30分 |
| 終了時 | 翌日の優先度確認 | 5分 |

### プロジェクト開始時

- [ ] サービス起動 (`start-all.ps1`)
- [ ] プロジェクト初期化 (`init-project.sh`)
- [ ] Conductorエージェント起動
- [ ] 要件をConductorに伝達
- [ ] タスク分解の承認
- [ ] サブエージェント起動

### プロジェクト終了時

- [ ] 全タスク完了確認
- [ ] 未マージPRの確認
- [ ] マイルストーン記録の確認
- [ ] ドキュメント更新の確認
- [ ] サービス停止

---

## よく使うコマンド・指示

### 状況確認

```
「進捗どう？」
「ボトルネックある？」
「BE-001の状態は？」
「今日完了予定のタスクは？」
「ブロックされてるタスクある？」
```

### 指示・命令

```
「〇〇機能を実装して」
「優先度を変更して。FE-002を先に」
「backend-dev を追加して」
「BE-001を frontend-dev-001 に再割り当てして」
「一旦全部止めて」
```

### 判断・承認

```
「JWT認証で進めて」
「そのPRはマージしてOK」
「一旦その問題は後回しで」
「リワークして」
「その設計でOK」
```

### 緊急対応

```
「全エージェント停止」
「BE-001を緊急で完了させて」
「ロックを強制解放して」
「〇〇の作業をキャンセル」
```

---

## ダッシュボード活用

### アクセス

- URL: http://localhost:3002
- API: http://localhost:4000

### 確認すべき画面

| 画面 | パス | 確認内容 |
|------|------|---------|
| Task Queue | Multi-Agent > Task Queue | タスクの進捗・割り当て状況 |
| Conductor Panel | Multi-Agent > Conductor | ボトルネック・リスク・決定履歴 |
| File Locks | Multi-Agent > File Locks | ロック競合の有無 |
| Shared Context | Multi-Agent > Shared Context | 共有された決定事項・ブロッカー |
| Org Chart | Multi-Agent > Org Chart | チーム構成・エージェント状態 |
| Agent Capabilities | Multi-Agent > Capabilities | エージェントのスキル・成功率 |
| Monitoring | Monitoring | システム全体のヘルス |

### アラートの意味

| 色 | 重要度 | 対応 |
|----|--------|------|
| 🔴 赤 | Critical | 即座に対応 |
| 🟠 橙 | High | 1時間以内に対応 |
| 🟡 黄 | Medium | 当日中に対応 |
| 🟢 緑 | Low | 計画的に対応 |

---

## トラブル時の対応

### Conductorが応答しない

1. ターミナルでエラー確認
2. エージェント再起動
3. ダッシュボードでAgent状態確認

### タスクが進まない

1. `/conductor bottlenecks` で原因確認
2. 依存関係の確認
3. エージェントの能力確認
4. 手動でタスク再割り当て

### ロック競合

1. ダッシュボードで競合確認
2. Conductorに優先順位を指示
3. 必要なら強制解放

---

## API リファレンス（人間が直接使う場合）

### 状況確認

```bash
# プロジェクト状況
curl http://localhost:4000/api/conductor/status/myproject

# 全体概要
curl http://localhost:4000/api/conductor/overview

# タスク一覧
curl "http://localhost:4000/api/queue/tasks?project_id=myproject"

# エージェント一覧
curl http://localhost:4000/api/agents
```

### 手動操作

```bash
# タスク手動割り当て
curl -X POST http://localhost:4000/api/queue/tasks/TASK_ID/assign \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"backend-dev-001"}'

# ロック強制解放
curl -X POST http://localhost:4000/api/locks/force-release \
  -H "Content-Type: application/json" \
  -d '{"lock_id":"xxx","reason":"Manual release"}'

# スケジューラー手動実行
curl -X POST http://localhost:4000/api/schedulers/run/dispatch
```

---

## まとめ

1. **人間は「指揮官」** - 大きな方向性と判断を担当
2. **Conductorは「現場監督」** - 日々の調整と監視を担当
3. **サブエージェントは「作業者」** - 実際の実装を担当

**人間の主な仕事:**
- 要件を伝える
- 判断を下す
- 承認する
- 例外に対応する

**Conductorに任せること:**
- タスク分解
- 進捗監視
- エージェント調整
- 問題の検出と報告
