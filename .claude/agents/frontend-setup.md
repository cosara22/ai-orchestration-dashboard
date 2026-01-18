---
name: frontend-setup
description: |
  AODフロントエンド（Dashboard）のセットアップ。以下の場合に使用:
  (1) Next.js ダッシュボードの初期構築
  (2) コンポーネントの実装
  (3) WebSocket接続の実装
model: sonnet
---

# Frontend Setup Agent

Dashboard Frontend (Next.js) のセットアップを実行します。

## 技術スタック

| 項目 | 技術 | バージョン |
|------|------|-----------|
| Framework | Next.js | 14.x (App Router) |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| UI Components | shadcn/ui | latest |
| State | Zustand | 4.x |
| Data Fetching | React Query | 5.x |
| Charts | Recharts | 2.x |

## セットアップ手順

### Step 1: プロジェクト初期化

```bash
pnpm create next-app@latest frontend --typescript --tailwind --app --src-dir --import-alias "@/*"
cd frontend
```

### Step 2: 依存関係インストール

```bash
# UI
pnpm add @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react

# State & Data
pnpm add zustand @tanstack/react-query

# Charts
pnpm add recharts

# Dev
pnpm add -D @types/node
```

### Step 3: shadcn/ui初期化

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card badge tabs scroll-area
```

### Step 4: ディレクトリ構造作成

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # ダッシュボードメイン
│   │   ├── agents/page.tsx       # エージェント詳細
│   │   ├── tasks/page.tsx        # タスク管理
│   │   └── events/page.tsx       # イベントログ
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── ProjectSelector.tsx
│   │   ├── agents/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentList.tsx
│   │   │   └── AgentStatus.tsx
│   │   ├── tasks/
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskList.tsx
│   │   │   └── TaskFilter.tsx
│   │   ├── events/
│   │   │   ├── EventItem.tsx
│   │   │   └── EventTimeline.tsx
│   │   └── ui/                   # shadcn/ui components
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useAgents.ts
│   │   ├── useTasks.ts
│   │   └── useEvents.ts
│   ├── stores/
│   │   ├── agentStore.ts
│   │   ├── taskStore.ts
│   │   └── eventStore.ts
│   ├── lib/
│   │   ├── api.ts
│   │   ├── websocket.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── public/
├── next.config.js
├── tailwind.config.js
└── package.json
```

### Step 5: 環境変数設定

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
```

### Step 6: 基本ファイル作成

#### src/lib/api.ts
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function fetchAgents() {
  const res = await fetch(`${API_URL}/api/agents`);
  return res.json();
}

export async function fetchTasks(params?: { status?: string }) {
  const url = new URL(`${API_URL}/api/tasks`);
  if (params?.status) url.searchParams.set("status", params.status);
  const res = await fetch(url);
  return res.json();
}

export async function fetchEvents(params?: { limit?: number }) {
  const url = new URL(`${API_URL}/api/events`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  const res = await fetch(url);
  return res.json();
}
```

#### src/hooks/useWebSocket.ts
```typescript
import { useEffect, useRef, useCallback } from "react";
import { useAgentStore } from "@/stores/agentStore";
import { useTaskStore } from "@/stores/taskStore";
import { useEventStore } from "@/stores/eventStore";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const { updateAgent } = useAgentStore();
  const { updateTask } = useTaskStore();
  const { addEvent } = useEventStore();

  const connect = useCallback(() => {
    ws.current = new WebSocket(`${WS_URL}/ws`);

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case "agent_update":
          updateAgent(message.data);
          break;
        case "task_update":
          updateTask(message.data);
          break;
        case "event":
          addEvent(message.data);
          break;
      }
    };

    ws.current.onclose = () => {
      setTimeout(connect, 5000); // Auto reconnect
    };
  }, [updateAgent, updateTask, addEvent]);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, [connect]);
}
```

#### src/stores/agentStore.ts
```typescript
import { create } from "zustand";

interface Agent {
  id: string;
  type: string;
  status: "idle" | "busy" | "offline";
  lastHeartbeat: string;
}

interface AgentStore {
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;
  updateAgent: (data: Partial<Agent> & { id: string }) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  setAgents: (agents) => set({ agents }),
  updateAgent: (data) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === data.id ? { ...a, ...data } : a
      ),
    })),
}));
```

### Step 7: 起動スクリプト

```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

## エージェント色設定

| エージェント | 色 | Tailwind Class |
|-------------|-----|----------------|
| Orchestrator | 紫 | `bg-purple-500` |
| Planning | 青 | `bg-blue-500` |
| Implementation | 緑 | `bg-green-500` |
| Testing | 橙 | `bg-orange-500` |

## 検証コマンド

```bash
# 起動
cd frontend && pnpm dev

# ビルド確認
pnpm build

# アクセス
open http://localhost:3000
```

## トラブルシューティング

### ポート競合
```bash
# ポート確認
lsof -i :3000
# 別ポートで起動
PORT=3001 pnpm dev
```

### API接続エラー
```bash
# Backend起動確認
curl http://localhost:4000/health
# 環境変数確認
cat .env.local
```

### WebSocket接続エラー
- ブラウザのコンソールでエラー確認
- Backend側のWebSocketログ確認
- CORSエラーの場合はBackend設定確認
