# Phase 15 実装計画書

## マルチエージェント並列開発基盤 - 統合実装計画

**作成日**: 2026-01-19
**対象**: 15ターミナル組織開発基盤
**前提**: エージェント数・プロジェクトチーム数に制限なし

---

## 現状サマリー

### ✅ 実装済み

| カテゴリ | 内容 |
|----------|------|
| **DB スキーマ** | task_queue, agent_capabilities, capability_tags, file_locks, shared_context, conductor_decisions, conflict_history, agent_health |
| **Task Queue API** | enqueue, list, next, assign, start, complete, fail, retry, stats, dispatch, timeout-check |
| **Agent API** | CRUD, heartbeat, capabilities CRUD, available, match/task |
| **スキル定義** | task-queue, agent-capability, file-lock, conductor, shared-context, agent-health, git-workflow, code-review, merge-coordinator |

### ⬜ 未実装

| カテゴリ | 内容 |
|----------|------|
| **File Lock API** | acquire, release, check, list, force-release, conflicts |
| **Conductor API** | status, decompose, reallocate, escalate, request-intervention, decisions, override |
| **Shared Context API** | post, list, for-me, acknowledge |
| **チーム/プロジェクト管理** | チーム定義、リード設定、プロジェクト別ビュー |
| **Frontend UI** | 能力管理UI、ファイルロックUI、組織図ビュー、コンダクターダッシュボード |
| **自動化** | ディスパッチスケジューラ、死活監視、エスカレーション通知 |

---

## 実装フェーズ

```
Phase 15-A ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 完了
    Task Queue & Auto-assignment System

Phase 15-B ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🔄 進行中
    Agent Capability Management (残り: UI, 自動学習)

Phase 15-C ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    File Lock & Conflict Management

Phase 15-D ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Shared Context & Communication

Phase 15-E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Conductor & Orchestration

Phase 15-F ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Team/Project Management & Dashboard UI

Phase 15-G ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Automation & Monitoring

Phase 15-H ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⬜ 未着手
    Hooks Integration & E2E Testing
```

---

## Phase 15-B: Agent Capability Management (残タスク)

### 15B-6: 能力の自動学習（成功率更新）

**目的**: タスク完了時にエージェントの能力スコアを自動更新

**実装内容**:
```typescript
// server/src/lib/capabilityLearning.ts

interface LearningResult {
  agent_id: string;
  tag: string;
  old_proficiency: number;
  new_proficiency: number;
  reason: string;
}

// タスク完了時に呼び出す
export async function updateCapabilityFromTaskResult(
  agentId: string,
  taskId: string,
  success: boolean,
  completionTimeMinutes: number,
  estimatedMinutes: number | null
): Promise<LearningResult[]>;
```

**API変更**:
- `POST /api/queue/:id/complete` - 完了時に自動でcapabilityLearning呼び出し
- `GET /api/agents/:id/capabilities/history` - 能力変化履歴

**ロジック**:
```
成功時:
  - 予定時間内完了 → proficiency += 2
  - 予定時間超過 → proficiency += 1
  - 大幅超過 → proficiency 変化なし

失敗時:
  - proficiency -= 3
  - 連続失敗(3回以上) → proficiency -= 5
```

---

### 15B-7: エージェント能力UIパネル

**ファイル**: `frontend/src/components/AgentCapabilityPanel.tsx`

**機能**:
1. エージェント一覧と能力タグ表示
2. 能力タグの追加・削除・proficiency調整
3. タスクとのマッチング率表示
4. 能力変化履歴グラフ

**UI設計**:
```
┌─────────────────────────────────────────────────────────────┐
│ Agent Capabilities                           [+ Add Agent] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ T1: Lead Architect                          Status: 🟢  │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ typescript ████████████ 95  │ react ██████░░░░ 60  │ │ │
│ │ │ architecture ███████████ 90 │ review ████████░░ 85 │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ Current Task: API設計レビュー    Workload: 2/3         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ T2: Backend Dev                             Status: 🟢  │ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

### 15B-8: タスク作成時の能力要件設定UI

**ファイル**: `frontend/src/components/TaskCreateModal.tsx` (拡張)

**機能**:
1. 能力タグの選択（タグマスターから）
2. 推奨エージェントの自動表示
3. 依存タスクの選択

---

## Phase 15-C: File Lock & Conflict Management

### タスク一覧

| ID | タスク | 内容 | 優先度 |
|----|--------|------|--------|
| 15C-1 | DBスキーマ | ✅ 済 (file_locks, conflict_history) | - |
| 15C-2 | ファイルロックCRUD API | /api/locks/* | High |
| 15C-3 | ロック取得/解放ロジック | 排他・共有ロックの実装 | High |
| 15C-4 | ロック有効期限・自動解放 | タイムアウト処理 | High |
| 15C-5 | 競合検出ロジック | 同時編集の検出・記録 | Medium |
| 15C-6 | 競合履歴記録 | conflict_historyへの保存 | Medium |
| 15C-7 | ロック可視化UIパネル | FileLockPanel.tsx | Medium |
| 15C-8 | 競合アラート通知 | WebSocket通知 | Medium |
| 15C-9 | Hooks連携 | ファイル編集前ロック確認スクリプト | Low |

### API設計

```typescript
// server/src/routes/locks.ts

// POST /api/locks/acquire
interface AcquireLockRequest {
  project_id: string;
  file_path: string;
  agent_id: string;
  lock_type?: 'exclusive' | 'shared';  // default: exclusive
  reason?: string;
  timeout_minutes?: number;  // default: 30
}

// POST /api/locks/release
interface ReleaseLockRequest {
  lock_id?: string;
  file_path?: string;
  agent_id: string;
}

// GET /api/locks/check?project_id=xxx&file_path=yyy&agent_id=zzz
// GET /api/locks/list?project_id=xxx&status=active&agent_id=zzz
// GET /api/locks/agent/:id
// POST /api/locks/force-release
// POST /api/locks/cleanup (期限切れロック削除)

// GET /api/conflicts/history?project_id=xxx
// POST /api/conflicts/record
```

---

## Phase 15-D: Shared Context & Communication

### タスク一覧

| ID | タスク | 内容 | 優先度 |
|----|--------|------|--------|
| 15D-1 | DBスキーマ | ✅ 済 (shared_context) | - |
| 15D-2 | 共有コンテキストCRUD API | /api/context/* | High |
| 15D-3 | コンテキストタイプ定義 | decision, blocker, learning, status | High |
| 15D-4 | 宛先フィルタリング | visibility: all, team, specific | Medium |
| 15D-5 | コンテキスト取得API | for-me, for-team, search | Medium |
| 15D-6 | 既読/確認管理 | acknowledge機能 | Low |
| 15D-7 | 共有コンテキストUIパネル | SharedContextPanel.tsx | Medium |
| 15D-8 | WebSocket通知 | 新規コンテキスト通知 | Medium |

### API設計

```typescript
// server/src/routes/context.ts

// POST /api/context/post
interface PostContextRequest {
  project_id: string;
  context_type: 'decision' | 'blocker' | 'learning' | 'status' | 'question' | 'answer';
  title: string;
  content: string;
  author_agent_id: string;
  visibility?: 'all' | 'team' | 'specific';
  target_agents?: string[];  // visibility=specific時
  priority?: number;  // 0=low, 1=normal, 2=high, 3=urgent
  tags?: string[];
  related_task_id?: string;
  related_file_paths?: string[];
  expires_at?: string;  // null = 無期限
}

// GET /api/context/list?project_id=xxx&type=decision&author=agent_id
// GET /api/context/for-me?agent_id=xxx&project_id=yyy
// GET /api/context/for-team?team_id=xxx
// POST /api/context/:id/acknowledge
// DELETE /api/context/:id
```

---

## Phase 15-E: Conductor & Orchestration

### タスク一覧

| ID | タスク | 内容 | 優先度 |
|----|--------|------|--------|
| 15E-1 | DBスキーマ | ✅ 済 (conductor_decisions) | - |
| 15E-2 | プロジェクト状況API | /api/conductor/status/:project_id | High |
| 15E-3 | タスク分解API | /api/conductor/decompose | High |
| 15E-4 | リソース再配置API | /api/conductor/reallocate | High |
| 15E-5 | エスカレーションAPI | /api/conductor/escalate | High |
| 15E-6 | 人間介入リクエストAPI | /api/conductor/request-intervention | Medium |
| 15E-7 | 意思決定ログAPI | /api/conductor/decisions | Medium |
| 15E-8 | 手動オーバーライドAPI | /api/conductor/override | Low |
| 15E-9 | ボトルネック検出ロジック | lib/bottleneckDetector.ts | High |
| 15E-10 | コンダクターダッシュボードUI | ConductorPanel.tsx | Medium |

### API設計

```typescript
// server/src/routes/conductor.ts

// GET /api/conductor/status/:project_id
interface ProjectStatus {
  project_id: string;
  project_name: string;
  overall_progress: number;
  health: 'good' | 'warning' | 'critical';
  active_agents: AgentStatus[];
  queued_tasks: number;
  in_progress_tasks: number;
  blocked_tasks: BlockedTask[];
  bottlenecks: Bottleneck[];
  estimated_completion: string;
  risks: Risk[];
}

// POST /api/conductor/decompose
interface DecomposeRequest {
  project_id: string;
  high_level_task: string;
  context?: string;
  max_subtasks?: number;
  auto_assign?: boolean;
}

// POST /api/conductor/reallocate
interface ReallocateRequest {
  project_id: string;
  task_ids: string[];
  from_agent_id: string;
  to_agent_id: string;
  reason: string;
}

// POST /api/conductor/escalate
interface EscalateRequest {
  project_id: string;
  issue_type: 'blocker' | 'conflict' | 'delay' | 'quality';
  description: string;
  affected_tasks?: string[];
  affected_agents?: string[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
  suggested_actions?: string[];
}
```

---

## Phase 15-F: Team/Project Management & Dashboard UI

### タスク一覧

| ID | タスク | 内容 | 優先度 |
|----|--------|------|--------|
| 15F-1 | チームテーブル追加 | teams, team_members DB | High |
| 15F-2 | チームCRUD API | /api/teams/* | High |
| 15F-3 | プロジェクト⇔チーム紐付け | project_teams テーブル | High |
| 15F-4 | チームリード設定 | team_members.role = 'lead' | Medium |
| 15F-5 | 組織図ビューUI | OrgChartView.tsx | High |
| 15F-6 | プロジェクト別フィルター | ProjectFilter component | Medium |
| 15F-7 | エージェント状態一覧UI | AgentGridView.tsx | Medium |
| 15F-8 | リアルタイム負荷表示 | WorkloadIndicator.tsx | Medium |
| 15F-9 | ブロッカーアラート表示 | BlockerAlert.tsx | Medium |

### DB設計

```sql
-- チームテーブル
CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  project_id TEXT,  -- メイン担当プロジェクト
  color TEXT,       -- UI表示用カラー
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

-- チームメンバーテーブル
CREATE TABLE team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',  -- 'lead' | 'member'
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, agent_id),
  FOREIGN KEY (team_id) REFERENCES teams(team_id),
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);
```

### 組織図UI設計

```
┌─────────────────────────────────────────────────────────────────────┐
│ [All Projects ▼]  Active: 15  Tasks: 47 queued  Locks: 12 active   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Team Alpha - WebApp                    Progress: ████████░░ 78% │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │  │
│  │ │ T1🟢 │ │ T2🟢 │ │ T3🟡 │ │ T4🟢 │ │ T5🟢 │                 │  │
│  │ │ Lead │ │ Back │ │ DB   │ │Front │ │ Test │                 │  │
│  │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │  │
│  │ Pending: 12  |  In Progress: 8  |  Completed: 23             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Team Beta - Mobile API                 Progress: ██████░░░░ 56% │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │  │
│  │ │ T6🟢 │ │ T7🟢 │ │ T8🔴 │ │ T9🟢 │ │T10🟡 │                 │  │
│  │ │ Lead │ │ Auth │ │ Core │ │Notify│ │ Test │                 │  │
│  │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │  │
│  │ ⚠️ T8: ブロッカー - DBマイグレーション待ち                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Team Gamma - ML Pipeline               Progress: ████░░░░░░ 35% │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │  │
│  │ │T11🟢 │ │T12🟢 │ │T13🟢 │ │T14🟢 │ │T15🟢 │                 │  │
│  │ │ Lead │ │ Data │ │Model │ │MLOps │ │ Eval │                 │  │
│  │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│ 状態: 🟢 Active  🟡 Waiting  🔴 Blocked  ⚪ Idle                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 15-G: Automation & Monitoring

### タスク一覧

| ID | タスク | 内容 | 優先度 |
|----|--------|------|--------|
| 15G-1 | 自動ディスパッチスケジューラ | cron/dispatch.ts | High |
| 15G-2 | タイムアウト自動チェック | cron/timeout.ts | High |
| 15G-3 | エージェント死活監視 | cron/healthCheck.ts | High |
| 15G-4 | ロック自動クリーンアップ | cron/lockCleanup.ts | Medium |
| 15G-5 | 優先度自動調整 | lib/priorityAdjuster.ts | Low |
| 15G-6 | メトリクス収集 | lib/metricsCollector.ts | Medium |
| 15G-7 | 外部通知連携 | Slack/Discord webhook | Low |
| 15G-8 | Human介入UI | InterventionModal.tsx | Medium |

### スケジューラ設計

```typescript
// server/src/scheduler/index.ts

import { CronJob } from 'cron';

// タスク自動割り当て (30秒間隔)
const dispatchJob = new CronJob('*/30 * * * * *', async () => {
  await autoDispatchTasks();
});

// タイムアウトチェック (5分間隔)
const timeoutJob = new CronJob('*/5 * * * *', async () => {
  await checkTaskTimeouts();
});

// エージェント死活監視 (1分間隔)
const healthJob = new CronJob('* * * * *', async () => {
  await checkAgentHealth();
});

// ロッククリーンアップ (1時間間隔)
const lockCleanupJob = new CronJob('0 * * * *', async () => {
  await cleanupExpiredLocks();
});
```

---

## Phase 15-H: Hooks Integration & E2E Testing

### タスク一覧

| ID | タスク | 内容 | 優先度 |
|----|--------|------|--------|
| 15H-1 | ファイル編集前ロック確認Hook | hooks/check_file_lock.py | High |
| 15H-2 | ファイル編集後ロック解放Hook | hooks/release_file_lock.py | High |
| 15H-3 | タスク開始/完了報告Hook | hooks/task_lifecycle.py | Medium |
| 15H-4 | ハートビート送信Hook | hooks/heartbeat.py | Medium |
| 15H-5 | settings.json テンプレート | .claude/settings.template.json | Medium |
| 15H-6 | E2Eテスト: マルチエージェントシナリオ | tests/e2e/multi-agent.spec.ts | High |
| 15H-7 | 負荷テスト: 15エージェント同時 | tests/load/fifteen-agents.ts | Medium |
| 15H-8 | ドキュメント整備 | docs/MULTI_AGENT_GUIDE.md | Low |

### Hooks設定テンプレート

```json
// .claude/settings.template.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool_name": "Write|Edit" },
        "command": "python .claude/hooks/check_file_lock.py",
        "timeout": 5000
      }
    ],
    "PostToolUse": [
      {
        "matcher": { "tool_name": "Write|Edit" },
        "command": "python .claude/hooks/release_file_lock.py",
        "timeout": 5000
      },
      {
        "matcher": { "tool_name": ".*" },
        "command": "python .claude/hooks/heartbeat.py",
        "timeout": 3000
      }
    ],
    "Stop": [
      {
        "command": "python .claude/hooks/session_end.py"
      }
    ]
  }
}
```

---

## 依存関係グラフ

```
15-A (Task Queue) ✅
    │
    ├──→ 15-B (Capability) 🔄
    │        │
    │        └──→ 15-E (Conductor)
    │
    ├──→ 15-C (File Lock)
    │        │
    │        └──→ 15-H (Hooks)
    │
    └──→ 15-D (Shared Context)
             │
             └──→ 15-E (Conductor)
                      │
                      └──→ 15-F (Team/Project)
                               │
                               └──→ 15-G (Automation)
```

---

## 実装順序（推奨）

### Wave 1: バックエンドAPI完成
1. **15C-2〜4**: File Lock API (acquire, release, check)
2. **15D-2〜5**: Shared Context API
3. **15B-6**: 能力自動学習

### Wave 2: コンダクター基盤
4. **15E-2**: プロジェクト状況API
5. **15E-4**: リソース再配置API
6. **15E-9**: ボトルネック検出

### Wave 3: チーム管理
7. **15F-1〜4**: チームDB・API

### Wave 4: フロントエンドUI
8. **15B-7〜8**: 能力管理UI
9. **15C-7**: ファイルロックUI
10. **15D-7**: 共有コンテキストUI
11. **15F-5〜9**: 組織図・プロジェクトビューUI
12. **15E-10**: コンダクターダッシュボード

### Wave 5: 自動化・統合
13. **15G-1〜4**: スケジューラ
14. **15H-1〜5**: Hooks連携
15. **15H-6〜8**: テスト・ドキュメント

---

## ファイル作成一覧

### Backend (server/src/)

```
routes/
├── locks.ts          # 15C: File Lock API
├── context.ts        # 15D: Shared Context API
├── conductor.ts      # 15E: Conductor API
└── teams.ts          # 15F: Team API

lib/
├── capabilityLearning.ts  # 15B-6: 能力自動学習
├── bottleneckDetector.ts  # 15E-9: ボトルネック検出
├── priorityAdjuster.ts    # 15G-5: 優先度調整
└── metricsCollector.ts    # 15G-6: メトリクス収集

scheduler/
├── index.ts          # スケジューラ統合
├── dispatch.ts       # 15G-1: 自動ディスパッチ
├── timeout.ts        # 15G-2: タイムアウト
├── healthCheck.ts    # 15G-3: 死活監視
└── lockCleanup.ts    # 15G-4: ロッククリーンアップ
```

### Frontend (frontend/src/components/)

```
AgentCapabilityPanel.tsx    # 15B-7: 能力管理
TaskCreateModal.tsx         # 15B-8: タスク作成（拡張）
FileLockPanel.tsx           # 15C-7: ファイルロック
SharedContextPanel.tsx      # 15D-7: 共有コンテキスト
ConductorPanel.tsx          # 15E-10: コンダクター
OrgChartView.tsx            # 15F-5: 組織図
ProjectFilter.tsx           # 15F-6: プロジェクトフィルター
AgentGridView.tsx           # 15F-7: エージェント一覧
WorkloadIndicator.tsx       # 15F-8: 負荷表示
BlockerAlert.tsx            # 15F-9: ブロッカー表示
InterventionModal.tsx       # 15G-8: 人間介入
```

### Hooks (.claude/hooks/)

```
check_file_lock.py     # 15H-1: 編集前ロック確認
release_file_lock.py   # 15H-2: 編集後ロック解放
task_lifecycle.py      # 15H-3: タスクライフサイクル
heartbeat.py           # 15H-4: ハートビート
session_end.py         # セッション終了処理
```

---

## 見積もり

| フェーズ | タスク数 | 複雑度 |
|---------|---------|--------|
| 15-B (残り) | 3 | Low |
| 15-C | 8 | Medium |
| 15-D | 7 | Medium |
| 15-E | 9 | High |
| 15-F | 9 | High |
| 15-G | 8 | Medium |
| 15-H | 8 | Medium |
| **合計** | **52** | - |

---

## 次のアクション

1. **今すぐ**: 15C-2〜4 (File Lock API) の実装開始
2. **並行可能**: 15D-2〜5 (Shared Context API)
3. **依存待ち**: 15E (Conductor) は 15C, 15D 完了後

開始するフェーズを選択してください。
