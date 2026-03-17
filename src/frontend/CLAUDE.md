# Anvil Frontend — CLAUDE.md

## Overview

Anvil is a visual flow editor for orchestrating AI agents and data connectors. Next.js 14 + TypeScript + Zustand + @xyflow/react. Tactical military HUD aesthetic.

## Stack

- **Framework:** Next.js 14.2 (App Router, React 18)
- **Language:** TypeScript 5.3 (strict mode)
- **State:** Zustand 4.5 (3 stores: flow, chat, deploy)
- **Graph Editor:** @xyflow/react v12
- **Styling:** Tailwind CSS 3.4 + CSS variables (see AGENT.md for design system)
- **UI Primitives:** Radix UI (dialog, dropdown, tooltip)
- **Animation:** Framer Motion 11
- **Icons:** Lucide React
- **Markdown:** react-markdown + remark-gfm

## Directory Structure

```
src/
├── app/
│   ├── page.tsx              # Home — renders <FlowEditor />
│   ├── layout.tsx            # Root layout (fonts, Toaster)
│   ├── globals.css           # Design tokens, component classes, ReactFlow overrides
│   └── api/proxy/            # Server-side proxy routes (never bypass)
│       ├── route.ts          # Generic REST proxy
│       ├── stream/route.ts   # SSE streaming proxy
│       └── upload/route.ts   # File upload + SSE proxy
├── components/
│   ├── flow/                 # Flow graph editor & node types
│   │   ├── FlowEditor.tsx    # Main orchestrator (layout, panels, canvas)
│   │   ├── FlowCanvas.tsx    # ReactFlow canvas (node/edge changes, copy/paste)
│   │   ├── AgentNode.tsx     # Agent node component
│   │   ├── ConnectorNode.tsx # Connector node component
│   │   ├── DeletableEdge.tsx # Custom edge with delete toolbar
│   │   ├── NodePalette.tsx   # Left sidebar — drag-to-add nodes
│   │   └── DeployButton.tsx  # Deploy/Live/Teardown state machine
│   ├── config/               # Right-side configuration panels
│   │   ├── AgentConfigPanel.tsx
│   │   ├── ConnectorConfigPanel.tsx
│   │   └── UniversalSettings.tsx
│   ├── chat/                 # Agent chat interface
│   │   ├── ChatDrawer.tsx    # Multi-agent chat panel with tabs
│   │   ├── ChatMessageList.tsx
│   │   ├── ChatInput.tsx     # Text + file upload input
│   │   ├── ChatBubble.tsx
│   │   ├── TacticalMarkdown.tsx
│   │   ├── ToolCallBlock.tsx
│   │   └── ToolResultBlock.tsx
│   └── layout/
│       ├── Header.tsx        # Top nav (title, tags, deploy, clear)
│       └── StatusBar.tsx     # Bottom bar (LLM/Anvil/Deploy indicators)
├── store/
│   ├── flowStore.ts          # Nodes, edges, settings, localStorage persistence
│   ├── chatStore.ts          # Conversations, SSE streaming, inter-agent msgs
│   └── deployStore.ts        # Deployment lifecycle & logging
└── lib/
    ├── anvilApi.ts           # API client (all calls go through /api/proxy)
    └── utils.ts              # cn() helper (clsx + tailwind-merge)
```

## Architecture Rules

### 1. Server-Side Proxy — MANDATORY

**All backend requests MUST go through Next.js `/api/proxy/*` routes.** Never fetch the backend directly from browser code.

- `/api/proxy` — Generic REST (POST with `{host, path, method, body}`)
- `/api/proxy/stream` — SSE streaming (chat)
- `/api/proxy/upload` — Multipart file upload + SSE

**Why:** Works with port-forwarding, firewalls, and remote deployments without exposing backend host to the browser.

**How:** Use `anvilApi.ts` functions — they handle proxy routing automatically.

### 2. State Management — Zustand

Three independent stores, no cross-store imports:

| Store | Domain | Persistence |
|-------|--------|-------------|
| `flowStore` | Nodes, edges, settings, `anvilHost` | localStorage (`anvil-flow-storage`) |
| `chatStore` | Conversations, SSE events, streaming state | Memory only |
| `deployStore` | Deploy status, logs, deployed IDs | Memory only |

Rules:
- Access store state with hooks: `useFlowStore(selector)`
- Never mutate state directly — use store actions
- Keep selectors granular to avoid unnecessary re-renders

### 3. Component Hierarchy

```
FlowEditor (orchestrator)
├─ Header
├─ NodePalette (left sidebar)
├─ FlowCanvas (center — ReactFlow)
├─ ChatDrawer (left overlay when open)
├─ AgentConfigPanel / ConnectorConfigPanel (right panel)
├─ UniversalSettings (right panel, toggleable)
└─ StatusBar (bottom)
```

- `FlowEditor` is the single top-level orchestrator — it manages panel visibility
- Node components (`AgentNode`, `ConnectorNode`) are memoized with `React.memo`
- Callbacks in canvas/node components use `useCallback` to prevent re-renders

### 4. ReactFlow Integration

- **Node types:** `agent`, `connector` (registered as custom components)
- **Edge type:** `deletable` (custom `DeletableEdge` with hover toolbar)
- **Copy/paste:** Ctrl+C/V supported for nodes
- **Selection:** Single-node selection opens the config panel

### 5. SSE Streaming Protocol

Chat messages stream as Server-Sent Events:

```
event: status       → "thinking" | "responding"
event: thinking     → Reasoning text chunks
event: delta        → Response text chunks
event: tool_call    → { tool, args }
event: tool_result  → { tool, result }
event: done         → { full_response }
event: error        → { message }
```

`chatStore` handles multi-line event buffering and real-time message state updates.

### 6. Design System

See `AGENT.md` for full design tokens. Key rules:
- **No border-radius** — sharp edges everywhere
- **Colors:** CSS variables (`var(--clr-*)`) — never hardcode hex
- **Tailwind prefix:** `hud-*` for theme colors
- **Fonts:** Chakra Petch (display), Source Code Pro (mono) — no system fonts
- **Glow shadows** on interactive states
- **Component classes:** `.panel`, `.btn-primary`, `.btn-ghost`, `.input-field`, `.tag-*`

### 7. Deployment Flow

The deploy sequence (in `deployStore`):
1. Configure LLM (`POST /llm/configure`)
2. Create agents (`POST /agents/add_single` per agent)
3. Start connectors (`POST /connectors/start` per connector)
4. Sync edges (`POST /edges/sync`)

Selective deployment supported — individual agents/connectors can be deployed without full teardown.

## Dev Commands

```bash
cd platform/anvil
npm install          # Install dependencies
npm run dev          # Dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint check
STATIC_EXPORT=true npm run build  # Static export (CI)
```

## Code Conventions

- Path alias: `@/*` → `./src/*`
- Use `cn()` from `@/lib/utils` for conditional classnames
- Toast notifications via `react-hot-toast` (imported `toast`)
- All API types defined inline in `anvilApi.ts` — no separate types file
- Component files are PascalCase, store/lib files are camelCase
