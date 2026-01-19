# マルチエージェント開発ベストプラクティス

効率的なマルチエージェント開発のためのガイドライン。

---

## 目次

1. [プロジェクト計画](#プロジェクト計画)
2. [タスク設計](#タスク設計)
3. [コミュニケーション](#コミュニケーション)
4. [コード品質](#コード品質)
5. [運用・監視](#運用監視)

---

## プロジェクト計画

### ✅ DO: 明確なマイルストーン設定

```
Week 1: 基盤構築
├── Day 1-2: プロジェクトセットアップ
├── Day 3-4: 基本アーキテクチャ
└── Day 5: レビュー・調整

Week 2: 機能実装
├── Feature A (FE-001, BE-001)
├── Feature B (FE-002, BE-002)
└── 統合テスト
```

### ✅ DO: 依存関係を明示

```bash
# タスク作成時に依存を指定
curl -X POST http://localhost:4000/api/queue/tasks \
  -d '{
    "title": "Implement API endpoint",
    "dependencies": ["task-db-schema"],
    "blocks": ["task-frontend-integration"]
  }'
```

### ❌ DON'T: 曖昧なゴール設定

```
❌ 「いい感じのUIを作る」
✅ 「ログインフォームを実装。バリデーション、エラー表示、成功時リダイレクト含む」
```

---

## タスク設計

### ✅ DO: 適切な粒度

**良いタスク:**
- 2-4時間で完了
- 明確な完了条件
- 1-2ファイルに収まる

```
✅ "UserProfileコンポーネントを実装"
✅ "GET /api/users/:id エンドポイントを追加"
❌ "ユーザー機能を実装" (大きすぎ)
❌ "変数名を修正" (小さすぎ)
```

### ✅ DO: 能力要件を明確に

```bash
# タスクに必要な能力を指定
{
  "title": "Implement real-time chart",
  "required_capabilities": ["react", "d3js", "websocket"],
  "priority": 2
}
```

### ✅ DO: 並列化可能な設計

```
# 依存関係のないタスクは並列実行
┌─────────────┐  ┌─────────────┐
│  Feature A  │  │  Feature B  │  ← 並列OK
│  (FE-001)   │  │  (FE-002)   │
└──────┬──────┘  └──────┬──────┘
       │                 │
       └────────┬────────┘
                ▼
        ┌───────────────┐
        │  Integration  │  ← 両方完了後
        │   (Tester)    │
        └───────────────┘
```

---

## コミュニケーション

### ✅ DO: 重要な決定は即座に共有

```bash
# 技術選択を共有
/shared-context post --type=decision --content="
## 状態管理ライブラリ選定
- 選択: Zustand
- 理由: 軽量、TypeScript親和性、学習コスト低
- 代替検討: Redux (過剰), Context (スケールしない)
"
```

### ✅ DO: ブロッカーは早めに報告

```bash
# 30分以上停滞したら報告
/shared-context post --type=blocker --content="
## ブロッカー: 外部API認証エラー
- 発生: 2026-01-19 14:30
- 影響: 決済機能の実装停止
- 試したこと: API key再発行、ドキュメント確認
- 必要なアクション: サードパーティへの問い合わせ
"
```

### ✅ DO: 完了報告は具体的に

```bash
/shared-context post --type=status --content="
## 完了: ユーザー認証API
- PR: #123
- 変更ファイル: server/src/routes/auth.ts, lib/jwt.ts
- テスト: ✅ ユニットテスト追加済み
- 注意点: JWT有効期限は環境変数で設定可能
"
```

### ❌ DON'T: 重要情報をローカルに留める

```
❌ 「このバグは後で直す」(記録なし)
✅ 共有コンテキストに記録 + タスク作成
```

---

## コード品質

### ✅ DO: ファイルロックを徹底

```bash
# 編集前
/file-lock acquire --file=src/components/Header.tsx

# 作業...

# 編集後 (すぐに解放)
/file-lock release --file=src/components/Header.tsx
```

### ✅ DO: ブランチ戦略を守る

```bash
# 機能ブランチを作成
/git-workflow branch --name=feat/user-profile

# 作業完了後
/git-workflow pr --base=main

# レビュー後にマージ
/merge-coordinator merge --pr=123
```

### ✅ DO: レビューコメントに対応

```
# レビューで指摘された項目
1. 🔴 必須修正 → 即座に対応
2. 🟡 推奨 → 対応またはコメントで理由説明
3. 🔵 質問 → 回答
```

### ❌ DON'T: 他エージェントの担当を勝手に編集

```
❌ 他人が作業中のファイルを編集
✅ ロック確認 → 空いていれば取得 → 編集
```

---

## 運用・監視

### ✅ DO: 定期的な健全性チェック

**Conductor の15分ルーティン:**
```bash
/agent-health check          # エージェント状態
/conductor bottlenecks       # ボトルネック
/task-queue status           # タスク状況
```

### ✅ DO: メトリクスを活用

```bash
# システムメトリクス確認
curl http://localhost:4000/api/metrics/system

# 注目指標:
# - task_wait_time: 30分超えたら要注意
# - agent_utilization: 80%超えたら追加検討
# - lock_conflicts: 頻発したらタスク設計見直し
```

### ✅ DO: アラートに即座に対応

```
優先度:
1. 🔴 Critical - 即座に対応
2. 🟠 High - 1時間以内
3. 🟡 Medium - 当日中
4. 🟢 Low - 計画的に対応
```

### ✅ DO: 定期的なクリーンアップ

```bash
# 毎日: 期限切れロック解放
curl -X POST http://localhost:4000/api/locks/cleanup

# 毎週: 古いイベント削除
curl -X DELETE "http://localhost:4000/api/events?older_than=7d"

# 毎月: DB最適化
sqlite3 data/aod.db "VACUUM; ANALYZE;"
```

---

## チェックリスト

### プロジェクト開始時

- [ ] プロジェクト初期化 (`init-project.sh`)
- [ ] チーム構成決定
- [ ] 役割と責任の明確化
- [ ] コミュニケーション規約の共有

### 毎日

- [ ] Conductorが朝の状況確認
- [ ] 各エージェントがタスク確認
- [ ] ブロッカーの早期報告
- [ ] 完了タスクのPR作成

### 毎週

- [ ] 進捗レビュー
- [ ] ボトルネック分析
- [ ] リソース調整
- [ ] ドキュメント更新

---

## アンチパターン

### 1. サイロ化

```
❌ エージェントが孤立して作業
✅ 定期的な情報共有
```

### 2. 過剰な同期

```
❌ 些細なことで全員にコンテキスト共有
✅ 重要な決定・ブロッカーのみ共有
```

### 3. ロック長期保持

```
❌ ファイルロックを数時間保持
✅ 作業完了後すぐに解放 (最大2時間)
```

### 4. レビューなしマージ

```
❌ 自分でApprove→Merge
✅ 別エージェントによるレビュー
```

### 5. ドキュメント軽視

```
❌ コードだけ書いて終わり
✅ 決定事項・学習内容を記録
```

---

## まとめ

1. **計画** - 明確なゴールと依存関係
2. **分割** - 適切な粒度のタスク
3. **共有** - 重要情報は即座に共有
4. **品質** - レビューとテストを徹底
5. **監視** - 定期的な健全性チェック
