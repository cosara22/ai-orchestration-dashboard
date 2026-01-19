# Phase 15 実装計画書

## マルチエージェント並列開発基盤 - 統合実装計画

**作成日**: 2026-01-19
**最終更新**: 2026-01-19
**対象**: 15ターミナル組織開発基盤
**前提**: エージェント数・プロジェクトチーム数に制限なし

---

## 進捗サマリー

```
Phase 15-A ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 完了
    Task Queue & Auto-assignment System

Phase 15-B ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 完了
    Agent Capability Management (能力管理UI, 自動学習)

Phase 15-C ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 完了
    File Lock & Conflict Management

Phase 15-D ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 完了
    Shared Context & Communication

Phase 15-E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 完了
    Conductor & Orchestration

Phase 15-F ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 完了
    Team/Project Management & Dashboard UI

Phase 15-G ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Automation & Monitoring

Phase 15-H ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Hooks Integration & E2E Testing
```

---

## 実装完了状況

### ✅ Phase 15-A: Task Queue & Auto-assignment (完了)

| タスク | 内容 | ファイル | 状態 |
|--------|------|----------|------|
| Task Queue API | enqueue, list, next, assign, start, complete, fail | `server/src/routes/queue.ts` | ✅ |
| Auto-dispatch | タスク自動割り当てロジック | 同上 | ✅ |
| DB Schema | task_queue テーブル | `server/src/lib/db.ts` | ✅ |

**コミット**: `da23f91`

---

### ✅ Phase 15-B: Agent Capability Management (完了)

| タスク | 内容 | ファイル | 状態 |
|--------|------|----------|------|
| Capability Tags | タグマスターテーブル | `server/src/lib/db.ts` | ✅ |
| Agent Capabilities | エージェント別能力管理 | `server/src/routes/agents.ts` | ✅ |
| 能力自動学習 | タスク完了時にスコア更新 | `server/src/lib/capabilityLearning.ts` | ✅ |
| AgentCapabilityPanel | 能力管理UI | `frontend/src/components/AgentCapabilityPanel.tsx` | ✅ |

**コミット**: `1165e3b`

---

### ✅ Phase 15-C: File Lock & Conflict Management (完了)

| タスク | 内容 | ファイル | 状態 |
|--------|------|----------|------|
| 15C-1 | DBスキーマ (file_locks, conflict_history) | `server/src/lib/db.ts` | ✅ |
| 15C-2~4 | ファイルロックCRUD API | `server/src/routes/locks.ts` | ✅ |
| 15C-5~6 | 競合検出・履歴記録 | 同上 | ✅ |
| 15C-7 | FileLockPanel UI | `frontend/src/components/FileLockPanel.tsx` | ✅ |

**API エンドポイント**:
- `POST /api/locks/acquire` - ロック取得
- `POST /api/locks/release` - ロック解放
- `GET /api/locks/check` - ロック確認
- `GET /api/locks/list` - ロック一覧
- `GET /api/locks/agent/:id` - エージェント別ロック
- `POST /api/locks/force-release` - 強制解放
- `POST /api/locks/cleanup` - 期限切れクリーンアップ
- `GET /api/locks/conflicts` - 競合履歴

**コミット**: `1165e3b`

---

### ✅ Phase 15-D: Shared Context & Communication (完了)

| タスク | 内容 | ファイル | 状態 |
|--------|------|----------|------|
| 15D-1 | DBスキーマ (shared_context) | `server/src/lib/db.ts` | ✅ |
| 15D-2~5 | 共有コンテキストCRUD API | `server/src/routes/context.ts` | ✅ |
| 15D-6 | 既読/確認管理 | 同上 | ✅ |
| 15D-7 | SharedContextPanel UI | `frontend/src/components/SharedContextPanel.tsx` | ✅ |

**API エンドポイント**:
- `POST /api/context/post` - コンテキスト投稿
- `GET /api/context/list` - コンテキスト一覧
- `GET /api/context/for-me` - 自分向けコンテキスト
- `GET /api/context/:id` - コンテキスト詳細
- `POST /api/context/:id/acknowledge` - 確認
- `DELETE /api/context/:id` - 削除

**コンテキストタイプ**:
- `decision` - 決定事項
- `blocker` - ブロッカー
- `learning` - 学習内容
- `status` - 状態更新
- `question` - 質問
- `answer` - 回答

**コミット**: `1165e3b`

---

### ✅ Phase 15-E: Conductor & Orchestration (完了)

| タスク | 内容 | ファイル | 状態 |
|--------|------|----------|------|
| 15E-1 | DBスキーマ (conductor_decisions) | `server/src/lib/db.ts` | ✅ |
| 15E-2 | プロジェクト状況API | `server/src/routes/conductor.ts` | ✅ |
| 15E-3 | タスク分解API | 同上 | ✅ |
| 15E-4 | リソース再配置API | 同上 | ✅ |
| 15E-5~6 | エスカレーション・介入リクエスト | 同上 | ✅ |
| 15E-7~8 | 意思決定ログ・オーバーライド | 同上 | ✅ |
| 15E-9 | ボトルネック検出 | `server/src/lib/bottleneckDetector.ts` | ✅ |
| 15E-10 | ConductorPanel UI | `frontend/src/components/ConductorPanel.tsx` | ✅ |

**API エンドポイント**:
- `GET /api/conductor/status/:project_id` - プロジェクト状況
- `GET /api/conductor/overview` - 全プロジェクト概要
- `POST /api/conductor/decompose` - タスク分解
- `POST /api/conductor/reallocate` - リソース再配置
- `POST /api/conductor/escalate` - エスカレーション
- `POST /api/conductor/request-intervention` - 人間介入要求
- `GET /api/conductor/decisions` - 意思決定ログ
- `POST /api/conductor/override` - 手動オーバーライド

**ボトルネック検出タイプ**:
- `agent_overload` - エージェント過負荷
- `capability_gap` - 能力ギャップ
- `dependency_chain` - 依存チェーン
- `lock_contention` - ロック競合
- `queue_stall` - キュー停滞

**コミット**: `a8cb837`

---

### ✅ Phase 15-F: Team/Project Management & Dashboard UI (完了)

| タスク | 内容 | ファイル | 状態 |
|--------|------|----------|------|
| 15F-1 | チームテーブル追加 (teams, team_members) | `server/src/lib/db.ts` | ✅ |
| 15F-2 | チームCRUD API | `server/src/routes/teams.ts` | ✅ |
| 15F-4 | チームリード設定 | 同上 | ✅ |
| 15F-5 | 組織図ビューUI | `frontend/src/components/OrgChartView.tsx` | ✅ |

**API エンドポイント**:
- `GET /api/teams` - チーム一覧
- `POST /api/teams` - チーム作成
- `GET /api/teams/overview/all` - 全チーム概要
- `GET /api/teams/:id` - チーム詳細
- `PATCH /api/teams/:id` - チーム更新
- `DELETE /api/teams/:id` - チーム削除
- `GET /api/teams/:id/members` - メンバー一覧
- `POST /api/teams/:id/members` - メンバー追加
- `DELETE /api/teams/:id/members/:agent_id` - メンバー削除
- `PATCH /api/teams/:id/members/:agent_id` - メンバー役割更新

**コミット**: `a8cb837`

---

### バグ修正 (完了)

| 問題 | 修正内容 | ファイル |
|------|----------|----------|
| broadcastToChannel未定義 | 関数追加 | `server/src/ws/handler.ts` |
| task_idカラム不在 | id参照に修正 | `server/src/routes/conductor.ts` |
| ルーティング競合 | overview/allを:idより前に移動 | `server/src/routes/teams.ts` |
| Hydration警告 | suppressHydrationWarning追加 | `frontend/src/app/layout.tsx` |

**コミット**: `f17858f`

---

## ⬜ Phase 15-G: Automation & Monitoring (次のステップ)

### タスク一覧

| ID | タスク | 内容 | 優先度 | 状態 |
|----|--------|------|--------|------|
| 15G-1 | 自動ディスパッチスケジューラ | `server/src/schedulers/taskDispatcher.ts` | High | ⬜ |
| 15G-2 | タイムアウト自動チェック | `server/src/schedulers/timeoutMonitor.ts` | High | ⬜ |
| 15G-3 | エージェント死活監視 | `server/src/schedulers/healthChecker.ts` | High | ⬜ |
| 15G-4 | ロック自動クリーンアップ | `server/src/schedulers/lockCleanup.ts` | Medium | ⬜ |
| 15G-5 | 優先度自動調整 | `server/src/lib/priorityAdjuster.ts` | Low | ⬜ |
| 15G-6 | メトリクス収集 | `server/src/lib/metricsCollector.ts` | Medium | ⬜ |
| 15G-7 | 外部通知連携 | Slack/Discord webhook | Low | ⬜ |
| 15G-8 | Human介入UI | `frontend/src/components/InterventionModal.tsx` | Medium | ⬜ |

### スケジューラ設計

```typescript
// server/src/schedulers/index.ts

// タスク自動割り当て (30秒間隔)
const dispatchJob = setInterval(autoDispatchTasks, 30000);

// タイムアウトチェック (5分間隔)
const timeoutJob = setInterval(checkTaskTimeouts, 300000);

// エージェント死活監視 (1分間隔)
const healthJob = setInterval(checkAgentHealth, 60000);

// ロッククリーンアップ (1時間間隔)
const lockCleanupJob = setInterval(cleanupExpiredLocks, 3600000);
```

---

## ⬜ Phase 15-H: Hooks Integration & E2E Testing

### タスク一覧

| ID | タスク | 内容 | 優先度 | 状態 |
|----|--------|------|--------|------|
| 15H-1 | ファイル編集前ロック確認Hook | `hooks/check_file_lock.py` | High | ⬜ |
| 15H-2 | ファイル編集後ロック解放Hook | `hooks/release_file_lock.py` | High | ⬜ |
| 15H-3 | タスク開始/完了報告Hook | `hooks/task_lifecycle.py` | Medium | ⬜ |
| 15H-4 | ハートビート送信Hook | `hooks/heartbeat.py` | Medium | ⬜ |
| 15H-5 | settings.json テンプレート | `.claude/settings.template.json` | Medium | ⬜ |
| 15H-6 | E2Eテスト: マルチエージェントシナリオ | `tests/e2e/multi-agent.spec.ts` | High | ⬜ |
| 15H-7 | 負荷テスト: 15エージェント同時 | `tests/load/fifteen-agents.ts` | Medium | ⬜ |
| 15H-8 | ドキュメント整備 | `docs/MULTI_AGENT_GUIDE.md` | Low | ⬜ |

---

## Git コミット履歴

```
f17858f fix: Resolve API errors and improve route handling
a8cb837 feat: Complete Phase 15 Wave 2-3 - Conductor, Teams, OrgChart
1165e3b feat: Complete Phase 15 Wave 1 - File Lock, Shared Context, Capability Learning
47a873a docs: Add Phase 15 implementation plan and multi-agent guides
7d13886 fix: Correct task_queue and agent_capabilities table schemas
da23f91 feat: Implement Phase 15-A - Task Queue & Auto-assignment System
```

---

## 実装済みファイル一覧

### Backend (server/src/)

```
routes/
├── queue.ts          # 15A: Task Queue API ✅
├── agents.ts         # 15B: Agent/Capability API ✅
├── locks.ts          # 15C: File Lock API ✅
├── context.ts        # 15D: Shared Context API ✅
├── conductor.ts      # 15E: Conductor API ✅
└── teams.ts          # 15F: Team API ✅

lib/
├── db.ts                 # DB Schema & Migrations ✅
├── capabilityLearning.ts # 15B: 能力自動学習 ✅
└── bottleneckDetector.ts # 15E: ボトルネック検出 ✅

ws/
└── handler.ts           # WebSocket Handler ✅
```

### Frontend (frontend/src/components/)

```
AgentCapabilityPanel.tsx    # 15B: 能力管理UI ✅
FileLockPanel.tsx           # 15C: ファイルロックUI ✅
SharedContextPanel.tsx      # 15D: 共有コンテキストUI ✅
ConductorPanel.tsx          # 15E: コンダクターダッシュボード ✅
OrgChartView.tsx            # 15F: 組織図UI ✅
```

### API Client (frontend/src/lib/)

```
api.ts                      # API Types & Methods ✅
```

---

## 検証済みAPI

```bash
# Health Check
curl http://localhost:4000/health
# {"status":"ok","timestamp":"...","version":"1.0.0","auth_enabled":false}

# Conductor Overview
curl http://localhost:4000/api/conductor/overview
# {"projects":[...],"total_active_agents":0,"total_pending_tasks":0,"total_active_locks":0}

# Teams Overview
curl http://localhost:4000/api/teams/overview/all
# {"teams":[],"summary":{"total_teams":0,"total_agents":0,...}}

# Task Queue
curl http://localhost:4000/api/queue/list
# {"tasks":[...],"total":0,"limit":50,"offset":0}

# File Locks
curl http://localhost:4000/api/locks/list
# {"locks":[...],"total":0}

# Shared Context
curl http://localhost:4000/api/context/list
# {"contexts":[...],"total":0}
```

---

## 起動方法

```bash
# サーバー起動
cd server && bun run dev

# フロントエンド起動
cd frontend && npm run dev

# アクセス
# Dashboard: http://localhost:3002
# API: http://localhost:4000
```

---

## 次のアクション

1. **Phase 15-G**: Automation & Monitoring
   - スケジューラ実装 (dispatch, timeout, health, cleanup)
   - メトリクス収集
   - 人間介入UI

2. **Phase 15-H**: Hooks Integration & E2E Testing
   - Hooks連携スクリプト
   - E2Eテスト
   - ドキュメント整備

開始するフェーズを選択してください。
