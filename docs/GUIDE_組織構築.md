# AIエージェント組織構築ガイド

マルチエージェント開発チームを効果的に編成・運用するためのガイド。

---

## 目次

1. [組織設計の原則](#組織設計の原則)
2. [チーム構成パターン](#チーム構成パターン)
3. [役割と責任](#役割と責任)
4. [コミュニケーション設計](#コミュニケーション設計)
5. [スケーリング戦略](#スケーリング戦略)

---

## 組織設計の原則

### 1. 明確な責務分離

各エージェントには明確な役割を割り当てる。

```
❌ 悪い例: 1エージェントが全てを担当
✅ 良い例: 専門エージェントが協力して作業
```

### 2. 適切な粒度

- **小さすぎ**: オーバーヘッドが増加
- **大きすぎ**: ボトルネックが発生
- **適切**: 1エージェント = 1-3タスク同時

### 3. 階層構造

```
Conductor (統括)
├── Team Lead (チームリード) ← 大規模プロジェクトで追加
│   ├── Developer 1
│   └── Developer 2
└── Support
    ├── Reviewer
    └── Tester
```

---

## チーム構成パターン

### パターン1: スモールチーム (3-5人)

小〜中規模プロジェクト向け。

```
プロジェクト
├── Conductor (1)        # 統括・計画
├── Full-stack Dev (2-3) # 開発
└── Reviewer (1)         # レビュー・テスト
```

**起動例:**
```bash
export AOD_PROJECT_ID="small-project"

# ターミナル1
AOD_AGENT_ID="conductor-001" AOD_AGENT_NAME="Conductor" ./agents/conductor/start.sh

# ターミナル2
AOD_AGENT_ID="dev-001" AOD_AGENT_NAME="Dev Alpha" ./agents/frontend-dev/start.sh

# ターミナル3
AOD_AGENT_ID="dev-002" AOD_AGENT_NAME="Dev Beta" ./agents/backend-dev/start.sh

# ターミナル4
AOD_AGENT_ID="reviewer-001" AOD_AGENT_NAME="Reviewer" ./agents/reviewer/start.sh
```

### パターン2: スタンダードチーム (6-10人)

中〜大規模プロジェクト向け。

```
プロジェクト
├── Conductor (1)
├── Frontend Team
│   ├── FE-Lead (1)
│   └── FE-Dev (2)
├── Backend Team
│   ├── BE-Lead (1)
│   └── BE-Dev (2)
└── QA Team
    ├── Tester (1)
    └── Reviewer (1)
```

### パターン3: 大規模チーム (10-15人)

複数機能の並列開発向け。

```
プロジェクト
├── Chief Conductor (1)      # 全体統括
├── Feature A Team
│   ├── Conductor-A (1)
│   ├── FE-Dev-A (1)
│   └── BE-Dev-A (1)
├── Feature B Team
│   ├── Conductor-B (1)
│   ├── FE-Dev-B (1)
│   └── BE-Dev-B (1)
├── Platform Team
│   ├── Infra (1)
│   └── DBA (1)
└── QA Team
    ├── Tester (2)
    └── Reviewer (2)
```

---

## 役割と責任

### Conductor (統括)

| 責任 | 内容 |
|------|------|
| 計画 | タスク分解、優先度設定 |
| 監視 | 進捗確認、ボトルネック検出 |
| 調整 | リソース再配置、エスカレーション |
| 報告 | 人間への状況報告 |

**してはいけないこと:**
- 直接コードを書く
- 長時間の実装作業

### Developer (開発者)

| 責任 | 内容 |
|------|------|
| 実装 | 割り当てられたタスクの実装 |
| テスト | ユニットテスト作成 |
| 共有 | 決定事項・ブロッカーの報告 |

**してはいけないこと:**
- 他エージェントの担当ファイルを編集
- 勝手にアーキテクチャ変更

### Reviewer (レビュアー)

| 責任 | 内容 |
|------|------|
| レビュー | PRのコードレビュー |
| 品質 | セキュリティ・パフォーマンス確認 |
| 教育 | ベストプラクティスの共有 |

### Tester (テスター)

| 責任 | 内容 |
|------|------|
| テスト | E2Eテスト作成・実行 |
| バグ | バグ報告・トラッキング |
| 品質 | テストカバレッジ維持 |

---

## コミュニケーション設計

### 共有すべき情報

| タイプ | 例 | スキル |
|--------|-----|--------|
| decision | 「APIはREST形式で実装」 | `/shared-context post --type=decision` |
| blocker | 「外部API応答なし」 | `/shared-context post --type=blocker` |
| learning | 「この方法が効率的」 | `/shared-context post --type=learning` |
| status | 「タスクA完了」 | `/shared-context post --type=status` |

### コミュニケーションフロー

```
1. Conductor がタスク作成
   └─→ /task-queue add --title="..."

2. Developer がタスク取得
   └─→ /task-queue claim --id=xxx

3. Developer が作業開始
   ├─→ /file-lock acquire
   └─→ /git-workflow branch

4. Developer が判断を共有
   └─→ /shared-context post --type=decision

5. Developer が完了報告
   ├─→ /file-lock release
   ├─→ /git-workflow pr
   └─→ /task-queue complete

6. Reviewer がレビュー
   └─→ /code-review review --pr=xxx

7. Conductor が確認
   └─→ /merge-coordinator merge
```

### ファイルロック規約

```
1. 編集前: 必ずロック取得
2. 編集中: 最大2時間
3. 編集後: 即座に解放
4. 競合時: Conductorに報告
```

---

## スケーリング戦略

### 水平スケーリング

同じ役割のエージェントを追加。

```bash
# Frontend開発者を追加
AOD_AGENT_ID="fe-003" AOD_AGENT_NAME="FE-Dev-003" ./agents/frontend-dev/start.sh
```

### 垂直スケーリング

専門エージェントを追加。

```bash
# セキュリティ専門家を追加
AOD_AGENT_ID="security-001" AOD_AGENT_NAME="Security Expert" claude
```

### 動的スケーリング

タスク量に応じてエージェント数を調整。

```
タスク待機 > 10件 → エージェント追加
タスク待機 < 3件 → エージェント削減
```

---

## チーム作成の手順

### 1. プロジェクト初期化

```bash
./scripts/init-project.sh --name "ProjectName" --team-size 5
```

### 2. チーム登録

```bash
curl -X POST http://localhost:4000/api/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Frontend Team",
    "description": "UI/UX Development",
    "project_id": "projectname"
  }'
```

### 3. メンバー追加

```bash
# チームにエージェントを追加
curl -X POST http://localhost:4000/api/teams/{team_id}/members \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "fe-001",
    "role": "lead"
  }'
```

### 4. エージェント起動

```bash
# 各エージェントを起動
export AOD_PROJECT_ID="projectname"
./agents/frontend-dev/start.sh
```

---

## ベストプラクティス

1. **最小構成から始める** - 3-5人で開始、必要に応じて追加
2. **Conductorは必須** - 統括なしは混乱の元
3. **ファイルロックを徹底** - 競合は生産性を大きく下げる
4. **定期的な同期** - 15分ごとの状況確認
5. **早めのエスカレーション** - 30分停滞したら報告
