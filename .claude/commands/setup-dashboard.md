---
description: AI Orchestration Dashboardの自動セットアップを実行。Backend, Frontend, Infrastructure を順次構築する。
argument-hint: [--phase=<phase>] [--skip=<phases>] [--verify-only] [--dry-run]
allowed-tools: [Agent, Bash, Read, Write, Glob, Grep, TodoWrite]
---

# /setup-dashboard

AI Orchestration Dashboard (AOD) の自動セットアップを実行します。

## オプション

引数: $ARGUMENTS

| オプション | 説明 |
|-----------|------|
| `--phase=<phase>` | 特定フェーズのみ実行（infrastructure, backend, frontend, hooks, integration） |
| `--skip=<phases>` | カンマ区切りでスキップするフェーズ |
| `--verify-only` | 検証のみ実行（変更なし） |
| `--dry-run` | 実行計画の表示のみ |

## 実行フロー

### 1. 引数解析

```
$1 = 最初の引数
$ARGUMENTS = 全引数
```

### 2. 実行モード判定

- `--dry-run`: 計画表示のみ
- `--verify-only`: dashboard-verifierのみ起動
- 通常: dashboard-conductorを起動

### 3. オーケストレーター起動

dashboard-conductorエージェントに以下を委譲:
- 依存関係解決
- フェーズ実行制御
- エラーハンドリング

## フェーズ一覧

| Phase | 要件ID | 内容 | 依存 |
|-------|--------|------|------|
| infrastructure | NFR-014 | Redis, SQLite セットアップ | なし |
| backend | FR-001〜003 | Bun + Hono API Gateway | infrastructure |
| frontend | FR-001〜003 | Next.js Dashboard | backend |
| hooks | IF-001 | Claude Code Hooks設定 | backend |
| integration | AT-001〜005 | 統合テスト | すべて |

## 使用例

### フルセットアップ
```
/setup-dashboard
```

### 特定フェーズのみ
```
/setup-dashboard --phase=backend
```

### 検証のみ
```
/setup-dashboard --verify-only
```

### スキップ指定
```
/setup-dashboard --skip=hooks
```

### 実行計画確認
```
/setup-dashboard --dry-run
```

## 実行手順

1. まず引数を解析し、実行モードを決定してください

2. `--dry-run`の場合:
   - 実行計画を表示して終了

3. `--verify-only`の場合:
   - dashboard-verifierエージェントを`--phase=all`で起動

4. 通常実行の場合:
   - dashboard-conductorエージェントを起動
   - 引数（--phase, --skip）を渡す

5. 完了後、サマリーレポートを表示

## 完了レポート形式

```
============================================
 AI Orchestration Dashboard Setup Complete
============================================

Phases:
  [OK] NFR-014: Infrastructure (Redis + SQLite)
  [OK] FR-001-003: Backend API Gateway
  [OK] FR-001-003: Frontend Dashboard
  [OK] IF-001: Hooks Configuration
  [OK] AT-001-005: Integration Tests

Services:
  - Dashboard: http://localhost:3000
  - API Gateway: http://localhost:4000
  - Redis: localhost:6379

Next Steps:
  1. Start services: docker compose up -d
  2. Configure Hooks in each project's .claude/settings.json
  3. Open dashboard: http://localhost:3000

============================================
```
