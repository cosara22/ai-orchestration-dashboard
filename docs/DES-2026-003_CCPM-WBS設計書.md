# CCPM/WBS設計書

**文書番号**: DES-2026-003
**作成日**: 2026年1月19日
**作成者**: Cosara + Claude Code
**ステータス**: Draft

---

## 1. 概要

Claude Codeのタスク管理と連携したCCPM（Critical Chain Project Management）とWBS（Work Breakdown Structure）機能を実装する。

### 1.1 目的

- Claude Codeセッション中のタスクを自動的にWBS階層に組み込む
- クリティカルチェーンとバッファ管理による進捗可視化
- プロジェクト全体の健全性監視

### 1.2 機能概要

| 機能 | 説明 |
|------|------|
| WBS管理 | タスクの階層構造、依存関係、担当者管理 |
| CCPM計算 | クリティカルチェーン特定、バッファ消費率計算 |
| Claude Code連携 | セッション/タスクイベントからWBS自動更新 |
| 可視化 | ガントチャート、バッファトレンド、進捗率 |

---

## 2. データモデル

### 2.1 WBS項目テーブル (wbs_items)

```sql
CREATE TABLE wbs_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wbs_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    parent_id TEXT,                    -- 親WBS項目のwbs_id (NULLはルート)
    code TEXT NOT NULL,                -- WBSコード (例: "1.2.3")
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'task',          -- 'phase', 'milestone', 'task', 'subtask'
    status TEXT DEFAULT 'pending',     -- 'pending', 'in_progress', 'completed', 'blocked'

    -- 見積もり
    estimated_duration INTEGER,        -- 見積もり工数（時間）
    aggressive_duration INTEGER,       -- 積極的見積もり（50%確率）
    safe_duration INTEGER,             -- 安全見積もり（90%確率）
    actual_duration INTEGER,           -- 実績工数

    -- 日程
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,

    -- 担当
    assignee TEXT,

    -- Claude Code連携
    linked_task_id TEXT,               -- tasks.task_idへの参照
    linked_session_id TEXT,            -- sessions.session_idへの参照
    auto_created INTEGER DEFAULT 0,    -- Claude Codeから自動作成されたか

    -- メタデータ
    sort_order INTEGER DEFAULT 0,
    metadata TEXT,                     -- JSON: 追加情報
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (parent_id) REFERENCES wbs_items(wbs_id),
    FOREIGN KEY (linked_task_id) REFERENCES tasks(task_id)
);
```

### 2.2 依存関係テーブル (wbs_dependencies)

```sql
CREATE TABLE wbs_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dependency_id TEXT UNIQUE NOT NULL,
    predecessor_id TEXT NOT NULL,      -- 先行タスクのwbs_id
    successor_id TEXT NOT NULL,        -- 後続タスクのwbs_id
    type TEXT DEFAULT 'FS',            -- 'FS', 'FF', 'SS', 'SF'
    lag INTEGER DEFAULT 0,             -- ラグ（時間）
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (predecessor_id) REFERENCES wbs_items(wbs_id),
    FOREIGN KEY (successor_id) REFERENCES wbs_items(wbs_id)
);
```

### 2.3 プロジェクトテーブル (projects)

```sql
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',      -- 'planning', 'active', 'completed', 'on_hold'

    -- CCPM設定
    project_buffer_ratio REAL DEFAULT 0.5,    -- プロジェクトバッファ比率
    feeding_buffer_ratio REAL DEFAULT 0.5,    -- フィーディングバッファ比率

    -- 日程
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,

    -- バッファ状態
    project_buffer_days INTEGER,
    project_buffer_consumed REAL DEFAULT 0,   -- 消費率 (0-100%)

    -- Claude Code連携
    auto_track_sessions INTEGER DEFAULT 1,    -- セッションを自動追跡

    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

### 2.4 バッファ履歴テーブル (buffer_history)

```sql
CREATE TABLE buffer_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    buffer_type TEXT NOT NULL,         -- 'project', 'feeding'
    wbs_id TEXT,                       -- feeding bufferの場合は対象WBS
    consumed_percent REAL NOT NULL,
    progress_percent REAL NOT NULL,
    recorded_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);
```

---

## 3. API設計

### 3.1 Projects API

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | /api/projects | プロジェクト一覧 |
| POST | /api/projects | プロジェクト作成 |
| GET | /api/projects/:id | プロジェクト詳細 |
| PATCH | /api/projects/:id | プロジェクト更新 |
| DELETE | /api/projects/:id | プロジェクト削除 |
| GET | /api/projects/:id/ccpm | CCPM分析結果 |
| GET | /api/projects/:id/buffer-trend | バッファトレンド |

### 3.2 WBS API

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | /api/projects/:id/wbs | WBS階層取得 |
| POST | /api/projects/:id/wbs | WBS項目作成 |
| PATCH | /api/wbs/:id | WBS項目更新 |
| DELETE | /api/wbs/:id | WBS項目削除 |
| POST | /api/wbs/:id/move | WBS項目移動 |
| GET | /api/wbs/:id/children | 子項目取得 |

### 3.3 Dependencies API

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | /api/projects/:id/dependencies | 依存関係一覧 |
| POST | /api/projects/:id/dependencies | 依存関係作成 |
| DELETE | /api/dependencies/:id | 依存関係削除 |

### 3.4 CCPM API

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| POST | /api/projects/:id/ccpm/calculate | CCPM再計算 |
| GET | /api/projects/:id/critical-chain | クリティカルチェーン取得 |
| GET | /api/projects/:id/buffers | バッファ状態取得 |

---

## 4. CCPM計算ロジック

### 4.1 クリティカルチェーン特定

```typescript
interface CriticalChainResult {
  criticalChain: string[];      // クリティカルチェーン上のwbs_id配列
  totalDuration: number;        // 合計工数
  projectBuffer: number;        // プロジェクトバッファ
  feedingBuffers: FeedingBuffer[];
}

interface FeedingBuffer {
  wbsId: string;               // 合流点のWBS
  bufferDays: number;          // バッファ日数
  sourceChain: string[];       // フィーディングチェーン
}
```

### 4.2 バッファ計算

```
プロジェクトバッファ = Σ(安全見積もり - 積極的見積もり) × バッファ比率

フィーディングバッファ = 各フィーディングチェーンの同様の計算
```

### 4.3 バッファ消費率

```
バッファ消費率 = (実績遅延 / バッファ日数) × 100%

進捗率 = (完了タスク工数 / 総タスク工数) × 100%
```

### 4.4 フィーバーチャート判定

| 領域 | 条件 | アクション |
|------|------|-----------|
| 緑 | 消費率 < 進捗率 × 0.5 | 順調 |
| 黄 | 消費率 < 進捗率 × 1.0 | 注意 |
| 赤 | 消費率 >= 進捗率 × 1.0 | 即時対応 |

---

## 5. Claude Code連携

### 5.1 自動WBS更新フロー

```
SessionStart イベント
    ↓
プロジェクト設定確認 (auto_track_sessions = 1)
    ↓
WBS項目自動作成 (type = 'task', auto_created = 1)
    ↓
linked_session_id 設定
    ↓
セッション中のタスク更新を監視
    ↓
SessionEnd イベント
    ↓
actual_end, actual_duration 更新
    ↓
CCPM再計算トリガー
```

### 5.2 イベントマッピング

| Claude Code イベント | WBS アクション |
|---------------------|---------------|
| SessionStart | WBS項目作成（親プロジェクト配下） |
| TaskUpdate (TodoWrite) | WBS項目のstatus/progress更新 |
| SessionEnd | actual_end設定、duration計算 |
| Error | WBS項目をblocked状態に |

---

## 6. フロントエンドコンポーネント

### 6.1 新規コンポーネント

| コンポーネント | ファイル | 機能 |
|--------------|---------|------|
| ProjectList | `ProjectList.tsx` | プロジェクト一覧・選択 |
| WBSTree | `WBSTree.tsx` | WBS階層ツリー表示 |
| WBSDetail | `WBSDetail.tsx` | WBS項目詳細・編集 |
| GanttChart | `GanttChart.tsx` | ガントチャート表示 |
| CCPMDashboard | `CCPMDashboard.tsx` | CCPM分析ダッシュボード |
| BufferChart | `BufferChart.tsx` | バッファ消費トレンド |
| FeverChart | `FeverChart.tsx` | フィーバーチャート |
| DependencyEditor | `DependencyEditor.tsx` | 依存関係編集 |

### 6.2 ページ構成

```
/projects                    # プロジェクト一覧
/projects/:id               # プロジェクト詳細
/projects/:id/wbs           # WBS管理
/projects/:id/gantt         # ガントチャート
/projects/:id/ccpm          # CCPM分析
```

---

## 7. 実装フェーズ

### Phase 13-A: データベース・API基盤
- [ ] WBS/CCPM関連テーブル作成
- [ ] Projects API実装
- [ ] WBS API実装
- [ ] Dependencies API実装

### Phase 13-B: CCPM計算エンジン
- [ ] クリティカルチェーン計算
- [ ] バッファ計算
- [ ] フィーバーチャート判定
- [ ] 定期再計算ジョブ

### Phase 13-C: Claude Code連携
- [ ] イベントハンドラー拡張
- [ ] 自動WBS生成ロジック
- [ ] 進捗自動更新

### Phase 13-D: フロントエンドUI
- [ ] プロジェクト管理画面
- [ ] WBSツリー表示
- [ ] ガントチャート
- [ ] CCPMダッシュボード

---

## 8. 技術スタック追加

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| チャート | Recharts | バッファトレンド、フィーバーチャート |
| ガント | @nivo/bar または自作 | ガントチャート |
| ツリー | react-arborist | WBS階層表示 |
| DnD | @dnd-kit | WBS並び替え |

---

**最終更新**: 2026-01-19
**ドキュメントバージョン**: v1.0.0
