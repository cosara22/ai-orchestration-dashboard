# CCPM/WBS拡張 実装計画書

**文書番号**: PLAN-2026-004
**作成日**: 2026年1月19日
**作成者**: Cosara + Claude Code
**ステータス**: Draft
**関連文書**: PRJ-2026-002, DES-2026-003_CCPM-WBS設計書.md

---

## 1. 概要

### 1.1 目的

CCPM/WBS機能を拡張し、以下の3つの主要機能を実装する：

1. **ガントチャート表示** - WBSアイテムと依存関係の可視化
2. **ドキュメント自動解析** - 企画書・要件定義書・設計書からWBSアイテム自動生成
3. **セマンティック進捗記録** - マイルストーン記録とネクストアクション文書化

### 1.2 想定される効果

| 効果 | 説明 |
|------|------|
| 計画の可視化 | ガントチャートでプロジェクト全体像を把握 |
| 初期設定の自動化 | 既存ドキュメントからWBS自動生成 |
| 知識の蓄積 | 開発実績をセマンティックデータとして保存 |
| 継続性の確保 | ネクストアクション文書による引継ぎ容易化 |

---

## 2. アーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Dashboard Frontend                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ GanttChart   │  │ DocParser    │  │ Milestone    │              │
│  │ Component    │  │ Modal        │  │ Recorder     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ REST API
┌─────────────────────────────────────────────────────────────────────┐
│                         API Gateway                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ /api/ccpm/   │  │ /api/docs/   │  │ /api/        │              │
│  │ gantt        │  │ parse        │  │ milestones   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                              ↓                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Document Parser Engine                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │   │
│  │  │ PRJ Parser  │  │ REQ Parser  │  │ DES Parser  │         │   │
│  │  │ (企画書)    │  │ (要件定義)  │  │ (設計書)    │         │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘         │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ wbs_items    │  │ milestones   │  │ semantic_    │              │
│  │ (既存)       │  │ (新規)       │  │ records(新規)│              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 データモデル拡張

```sql
-- マイルストーンテーブル（新規）
CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    wbs_id TEXT,                          -- 関連WBSアイテム（オプション）
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'checkpoint',        -- checkpoint, release, review, decision
    status TEXT DEFAULT 'pending',         -- pending, achieved, missed, deferred
    target_date TEXT,
    achieved_date TEXT,
    evidence TEXT,                         -- 達成根拠（JSON）
    next_actions TEXT,                     -- ネクストアクション（JSON配列）
    lessons_learned TEXT,                  -- 学んだこと（テキスト）
    metadata TEXT,                         -- セマンティックメタデータ（JSON）
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (wbs_id) REFERENCES wbs_items(wbs_id)
);

-- セマンティック記録テーブル（新規）
CREATE TABLE IF NOT EXISTS semantic_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    milestone_id TEXT,                     -- 関連マイルストーン（オプション）
    record_type TEXT NOT NULL,             -- decision, insight, problem, solution, context
    title TEXT NOT NULL,
    content TEXT NOT NULL,                 -- マークダウンコンテンツ
    tags TEXT,                             -- JSON配列
    relations TEXT,                        -- 関連レコードID（JSON配列）
    source_session_id TEXT,                -- 生成元セッション
    source_event_id TEXT,                  -- 生成元イベント
    embedding_vector BLOB,                 -- ベクトル埋め込み（将来のRAG用）
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id)
);

-- ドキュメント解析結果テーブル（新規）
CREATE TABLE IF NOT EXISTS parsed_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,                -- PRJ, REQ, DES, MILESTONE, etc.
    doc_path TEXT NOT NULL,
    doc_hash TEXT NOT NULL,                -- ファイルハッシュ（変更検知用）
    parsed_structure TEXT NOT NULL,        -- 解析結果（JSON）
    wbs_mappings TEXT,                     -- WBSへのマッピング結果（JSON）
    parsed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);
```

---

## 3. 実装フェーズ

### Phase 14-A: ガントチャート表示（優先度: 高）

**目標**: WBSアイテムと依存関係をガントチャートで可視化

#### タスク一覧

| ID | タスク | 見積もり | 依存 |
|----|--------|----------|------|
| 14A-1 | ガントチャートライブラリ選定・導入 | 2h | - |
| 14A-2 | ガントチャートコンポーネント実装 | 4h | 14A-1 |
| 14A-3 | WBSデータ→ガント形式変換ロジック | 2h | 14A-2 |
| 14A-4 | 依存関係の矢印表示 | 2h | 14A-3 |
| 14A-5 | クリティカルチェーンハイライト | 1h | 14A-4 |
| 14A-6 | ドラッグ&ドロップによるスケジュール調整 | 3h | 14A-5 |
| 14A-7 | ズーム・スクロール機能 | 1h | 14A-2 |
| 14A-8 | CCPMPanelへの統合 | 1h | 14A-7 |

**ライブラリ候補**:
- `frappe-gantt` - 軽量、MIT License
- `gantt-task-react` - React native、TypeScript対応
- 自作（Recharts活用） - 完全カスタマイズ可能

**成果物**:
- `frontend/src/components/GanttChart.tsx`
- `frontend/src/lib/ganttUtils.ts`

---

### Phase 14-B: ドキュメント解析エンジン（優先度: 高）

**目標**: 企画書・要件定義書・設計書からWBSアイテムを自動生成

#### タスク一覧

| ID | タスク | 見積もり | 依存 |
|----|--------|----------|------|
| 14B-1 | DBスキーマ追加（parsed_documents） | 0.5h | - |
| 14B-2 | Markdownパーサー実装 | 2h | 14B-1 |
| 14B-3 | PRJ（企画書）パーサー実装 | 2h | 14B-2 |
| 14B-4 | REQ（要件定義書）パーサー実装 | 3h | 14B-2 |
| 14B-5 | DES（設計書）パーサー実装 | 2h | 14B-2 |
| 14B-6 | WBSアイテム自動生成ロジック | 3h | 14B-3,4,5 |
| 14B-7 | API実装（/api/docs/parse） | 2h | 14B-6 |
| 14B-8 | ドキュメント解析モーダルUI | 2h | 14B-7 |
| 14B-9 | 差分検知・更新機能 | 2h | 14B-6 |

**ドキュメント解析ルール**:

```typescript
// 企画書(PRJ)からの抽出
interface PRJExtraction {
  phases: Array<{
    name: string;           // "## 3. 提案ソリューション" → Phase名
    objectives: string[];   // 目標リスト
    components: string[];   // コンポーネントリスト
  }>;
}

// 要件定義書(REQ)からの抽出
interface REQExtraction {
  requirements: Array<{
    id: string;             // "FR-001-01"
    title: string;          // 要件名
    priority: string;       // P0, P1, P2
    acceptance_criteria: string[];  // 受入基準
  }>;
}

// 設計書(DES)からの抽出
interface DESExtraction {
  components: Array<{
    name: string;           // コンポーネント名
    layer: string;          // Frontend, Backend, Data等
    endpoints: string[];    // APIエンドポイント
    tables: string[];       // DBテーブル
  }>;
}
```

**成果物**:
- `server/src/lib/docParser.ts`
- `server/src/routes/docs.ts`
- `frontend/src/components/DocParserModal.tsx`

---

### Phase 14-C: セマンティック進捗記録（優先度: 高）

**目標**: マイルストーン達成時に実績を記録し、ネクストアクション文書を生成

#### タスク一覧

| ID | タスク | 見積もり | 依存 |
|----|--------|----------|------|
| 14C-1 | DBスキーマ追加（milestones, semantic_records） | 1h | - |
| 14C-2 | マイルストーンCRUD API | 2h | 14C-1 |
| 14C-3 | セマンティック記録CRUD API | 2h | 14C-1 |
| 14C-4 | マイルストーン記録UIコンポーネント | 3h | 14C-2 |
| 14C-5 | ネクストアクション入力フォーム | 2h | 14C-4 |
| 14C-6 | 進捗レポート自動生成 | 3h | 14C-3 |
| 14C-7 | マークダウンエクスポート機能 | 2h | 14C-6 |
| 14C-8 | Claude Codeセッション連携 | 2h | 14C-3 |
| 14C-9 | タグ・関連付け機能 | 1h | 14C-3 |

**マイルストーンレコード構造**:

```typescript
interface MilestoneRecord {
  milestone_id: string;
  project_id: string;
  title: string;                    // "Phase 14-A: ガントチャート実装完了"
  description: string;
  type: "checkpoint" | "release" | "review" | "decision";
  status: "pending" | "achieved" | "missed" | "deferred";

  // 達成情報
  target_date: string;
  achieved_date: string | null;
  evidence: {
    commits: string[];              // 関連コミットハッシュ
    sessions: string[];             // 関連セッションID
    files_changed: string[];        // 変更ファイル一覧
    test_results: object;           // テスト結果サマリー
  };

  // ネクストアクション
  next_actions: Array<{
    action: string;                 // "ガントチャートのパフォーマンス最適化"
    priority: "high" | "medium" | "low";
    assignee?: string;
    due_date?: string;
    context: string;                // 背景・理由
  }>;

  // 振り返り
  lessons_learned: string;          // マークダウン形式

  // セマンティックメタデータ
  metadata: {
    keywords: string[];             // 自動抽出キーワード
    related_milestones: string[];   // 関連マイルストーンID
    complexity_score: number;       // 1-5
    satisfaction_score: number;     // 1-5
  };
}
```

**自動生成レポート形式**:

```markdown
# マイルストーンレポート: [Title]

**達成日**: 2026-01-19
**プロジェクト**: AI Orchestration Dashboard
**フェーズ**: Phase 14-A

## 1. 概要
[Description]

## 2. 達成内容
- [x] ガントチャートコンポーネント実装
- [x] 依存関係の矢印表示
- [x] クリティカルチェーンハイライト

## 3. エビデンス
### 3.1 関連コミット
- abc123: feat: Add GanttChart component
- def456: feat: Add dependency arrows

### 3.2 変更ファイル
- frontend/src/components/GanttChart.tsx (新規)
- frontend/src/lib/ganttUtils.ts (新規)

## 4. 学んだこと
[Lessons Learned]

## 5. ネクストアクション
| 優先度 | アクション | 期限 | 担当 |
|--------|-----------|------|------|
| High | パフォーマンス最適化 | 2026-01-20 | - |
| Medium | モバイル対応 | 2026-01-25 | - |

## 6. メタデータ
- **キーワード**: ガントチャート, WBS, CCPM, 可視化
- **複雑度**: 3/5
- **満足度**: 4/5
```

**成果物**:
- `server/src/routes/milestones.ts`
- `server/src/routes/semantic.ts`
- `frontend/src/components/MilestoneRecorder.tsx`
- `frontend/src/components/NextActionForm.tsx`
- `server/src/lib/reportGenerator.ts`

---

## 4. API設計

### 4.1 ガントチャートAPI

```
GET /api/ccpm/projects/:id/gantt
  Query: start_date, end_date, include_completed
  Response: { items: GanttItem[], dependencies: GanttDependency[] }

POST /api/ccpm/wbs/:id/schedule
  Body: { planned_start, planned_end }
  Response: { updated: WBSItem, conflicts: Conflict[] }
```

### 4.2 ドキュメント解析API

```
POST /api/docs/parse
  Body: { project_id, doc_path, doc_type }
  Response: { doc_id, parsed_structure, suggested_wbs: WBSItem[] }

GET /api/docs/:id/wbs-preview
  Response: { wbs_items: WBSItem[], mappings: Mapping[] }

POST /api/docs/:id/apply
  Body: { selected_items: string[] }
  Response: { created_wbs: WBSItem[] }

GET /api/docs/project/:project_id
  Response: { documents: ParsedDocument[] }
```

### 4.3 マイルストーンAPI

```
GET /api/milestones
  Query: project_id, status, type
  Response: { milestones: Milestone[] }

POST /api/milestones
  Body: MilestoneCreate
  Response: { milestone: Milestone }

PATCH /api/milestones/:id
  Body: MilestoneUpdate
  Response: { milestone: Milestone }

POST /api/milestones/:id/achieve
  Body: { evidence, lessons_learned, next_actions }
  Response: { milestone: Milestone, report: string }

GET /api/milestones/:id/report
  Query: format (md, html, json)
  Response: { report: string }
```

### 4.4 セマンティック記録API

```
GET /api/semantic
  Query: project_id, record_type, tags, search
  Response: { records: SemanticRecord[] }

POST /api/semantic
  Body: SemanticRecordCreate
  Response: { record: SemanticRecord }

GET /api/semantic/search
  Query: query, project_id, limit
  Response: { results: SearchResult[] }

GET /api/semantic/related/:id
  Response: { related: SemanticRecord[] }
```

---

## 5. 実装スケジュール

```
Phase 14-A: ガントチャート表示
├─ 14A-1 ~ 14A-3: 基本実装 .................. Day 1
├─ 14A-4 ~ 14A-6: 依存関係・操作 ............ Day 2
└─ 14A-7 ~ 14A-8: 仕上げ・統合 .............. Day 2

Phase 14-B: ドキュメント解析
├─ 14B-1 ~ 14B-2: 基盤実装 .................. Day 3
├─ 14B-3 ~ 14B-5: 各パーサー実装 ............ Day 3-4
├─ 14B-6 ~ 14B-7: WBS生成・API .............. Day 4
└─ 14B-8 ~ 14B-9: UI・差分検知 .............. Day 5

Phase 14-C: セマンティック進捗記録
├─ 14C-1 ~ 14C-3: DB・API実装 ............... Day 5
├─ 14C-4 ~ 14C-5: UI実装 .................... Day 6
├─ 14C-6 ~ 14C-7: レポート生成 .............. Day 6
└─ 14C-8 ~ 14C-9: 連携・仕上げ .............. Day 7

総見積もり: 約7日（実装のみ、テスト別途）
```

---

## 6. テスト計画

### 6.1 Phase 14-A テスト

| テストID | テスト内容 | 期待結果 |
|----------|-----------|----------|
| T14A-1 | WBSアイテムがガントチャートに表示される | 全アイテムがバー表示 |
| T14A-2 | 依存関係が矢印で表示される | predecessor→successorの矢印 |
| T14A-3 | クリティカルチェーンが赤色ハイライト | 最長パスが強調表示 |
| T14A-4 | ドラッグでスケジュール変更 | APIが呼ばれ、DBが更新 |
| T14A-5 | ズーム操作 | 表示範囲が変更される |

### 6.2 Phase 14-B テスト

| テストID | テスト内容 | 期待結果 |
|----------|-----------|----------|
| T14B-1 | 企画書からフェーズ抽出 | 正しい数のフェーズが抽出 |
| T14B-2 | 要件定義書からFR抽出 | FR-IDが正しく抽出 |
| T14B-3 | 設計書からコンポーネント抽出 | レイヤー別に分類 |
| T14B-4 | WBS自動生成 | 階層構造が正しく生成 |
| T14B-5 | 差分検知 | ハッシュ変更を検出 |

### 6.3 Phase 14-C テスト

| テストID | テスト内容 | 期待結果 |
|----------|-----------|----------|
| T14C-1 | マイルストーン作成 | DBに保存される |
| T14C-2 | 達成記録 | evidence, next_actionsが保存 |
| T14C-3 | レポート生成 | マークダウン形式で出力 |
| T14C-4 | セマンティック記録保存 | タグ・関連付けが機能 |
| T14C-5 | 検索機能 | キーワード検索が機能 |

---

## 7. リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| ガントチャートライブラリの選定ミス | 中 | POCで事前検証 |
| ドキュメント形式の多様性 | 中 | 柔軟なパーサー設計 |
| パフォーマンス問題（大量WBS） | 中 | 仮想化・遅延読み込み |
| セマンティック検索精度 | 低 | 将来のベクトル検索で改善 |

---

## 8. 成功基準

### Phase 14-A
- [ ] 100件のWBSアイテムがスムーズに表示される
- [ ] 依存関係が視覚的に理解できる
- [ ] ドラッグ操作でスケジュール変更が反映される

### Phase 14-B
- [ ] 既存の3種ドキュメント（PRJ, REQ, DES）が解析できる
- [ ] 解析結果から80%以上のWBSが自動生成される
- [ ] 差分検知により更新が検出される

### Phase 14-C
- [ ] マイルストーン達成時にレポートが自動生成される
- [ ] ネクストアクションが構造化データとして保存される
- [ ] 過去の記録を検索・参照できる

---

## 9. 次のステップ

1. **Phase 14-A開始**: ガントチャートライブラリの選定・POC
2. **並行準備**: Phase 14-B, 14-CのDBスキーマ設計レビュー
3. **実装開始**: 計画承認後、Phase 14-Aから順次実装

---

**承認**: [ ] 計画承認待ち
**作成者**: Claude Code
**レビュー者**: Cosara
