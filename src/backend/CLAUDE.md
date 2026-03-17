# Champ Backend — CLAUDE.md

## Overview

FastAPI backend for the Champ flow editor. Manages AI agents (via PydanticAI), data connectors (ZMQ/Kafka/DIS), and their interconnections. All state is in-memory.

## Stack

- **Framework:** FastAPI (async Python)
- **Language:** Python 3.11+
- **LLM Integration:** PydanticAI (supports OpenAI, Anthropic, any OpenAI-compatible endpoint)
- **SSE:** sse-starlette
- **Connectors:** pyzmq, aiokafka, opendis
- **Validation:** Pydantic v2

## Directory Structure

```
champ-backend/
├── app/
│   ├── main.py           # FastAPI app — all routes, in-memory stores, connector loops
│   └── agent_llm.py      # PydanticAI agent creation, streaming execution, tool registry
├── requirements.txt      # Python dependencies
└── sim_publisher.py      # Standalone data publisher for testing (ZMQ/Kafka/DIS)
```

## Architecture Rules

### 1. In-Memory State

All state lives in Python dicts — no database:

```python
agents_store: dict[str, AgentInfo]           # Agent metadata & config
agent_conversations: dict[str, list[dict]]   # Per-agent chat history
agent_tasks: dict[str, asyncio.Task]         # Background agent run loops
connectors_store: dict[str, ConnectorInfo]   # Connector metadata & config
connector_tasks: dict[str, asyncio.Task]     # Connector consumer loops
connector_data: dict[str, deque]             # Buffered data (max 200 records)
data_edges: list[dict]                       # connector→agent connections
```

**Why:** Fast iteration for simulation/testing. No DB setup overhead.

### 2. API Design

All endpoints are flat (no nested routers). Key groups:

**LLM Configuration:**
```
POST  /llm/configure          # Set provider, API key, model
GET   /llm/status             # Check LLM config
```

**Agent Management:**
```
POST  /agents/add_single      # Create agent with name, model, config
POST  /agents/add_batch       # Create multiple agents
GET   /agents/list            # List all agents
DELETE /agents/{id}/decommission
DELETE /agents/decommission_all
```

**Agent Communication:**
```
POST  /agents/{id}/chat           # SSE streaming chat
POST  /agents/{id}/chat/sync      # Synchronous chat (full response)
POST  /agents/{id}/chat/upload    # Chat with file attachment (SSE)
GET   /agents/{id}/files          # List agent workspace files
```

**Connectors:**
```
POST  /connectors/start           # Start connector (protocol-specific config)
DELETE /connectors/{id}/stop
GET   /connectors/list
GET   /connectors/{id}/data       # Buffered data (last_n param)
```

**Data Edges:**
```
POST  /edges/sync                 # Sync connector→agent connections
GET   /edges/list
```

**Health:**
```
GET   /ping
GET   /health_check
GET   /agents/health
GET   /agents/{id}/health
```

### 3. Agent Execution Model

**Creation:** `POST /agents/add_single` → stores metadata, starts background `agent_run_loop()`

**Chat (streaming):**
1. `build_system_prompt()` — includes agent identity, linked connector data (last 20 msgs), workspace files
2. `create_agent()` — PydanticAI agent with model and registered tools
3. `agent.run_stream()` — yields SSE events: `status`, `thinking`, `delta`, `tool_call`, `tool_result`, `done`, `error`
4. Saves conversation history to `agent_conversations`

**Chat (sync):** Same pipeline but waits for full response, returns `{ response, tool_calls, usage }`

### 4. System Prompt Assembly

```
build_system_prompt(agent_id, agent_info, connectors_store, data_edges):
  1. Base identity: "You are {name} (id: {id}), an AI agent in Champ"
  2. Reasoning hint (if reasoning_config set)
  3. Live data feeds: JSON from linked connectors (auto-injected, no tool call needed)
  4. Workspace files: text content (max 4000 chars per file)
```

Agents see connector data automatically via system prompt — no explicit data retrieval required.

### 5. Connector Architecture

**Supported protocols:**
| Protocol | Library | Config |
|----------|---------|--------|
| ZMQ | pyzmq | endpoint, topic |
| Kafka | aiokafka | bootstrap_servers, topic, group_id |
| DIS | opendis | multicast_group, port |
| UCI | (stub) | — |

Each connector runs an async consumer loop that buffers messages into a `deque(maxlen=200)`.

**Mock fallback:** If the protocol library isn't installed, generates synthetic military asset data instead of failing.

### 6. Tool System

Four registered tools (some are stubs):

| Tool | Purpose | Status |
|------|---------|--------|
| `send_agent_message` | Send message to another agent | Functional |
| `graph_rag_query` | Query knowledge graph | Stub |
| `mdmp_plan` | Military decision-making process | Stub |
| `text_to_sql` | Natural language → SQL | Stub |

Tools are enabled per-agent via `agent_config.tool_config.tools_list`.

### 7. File Handling

- Agent workspace: `.build/{agent_id}/uploads/`
- Uploaded files stored locally, content included in system prompt (text files, max 4000 chars)
- `GET /agents/{id}/files` lists workspace contents

### 8. CORS

Open CORS (`allow_origins=["*"]`) — the frontend uses server-side proxy, so CORS is not a security boundary.

## Dev Commands

```bash
cd platform/champ-backend

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn app.main:app --reload --port 8000

# Run data simulator (for testing connectors)
python sim_publisher.py --zmq --kafka --dis
```

## Code Conventions

- All routes defined directly in `main.py` — no router modules
- Pydantic v2 models for request/response schemas (defined inline in `main.py`)
- Async everywhere — use `asyncio.create_task()` for background work
- Connector consumer loops are cancellable async tasks
- Agent IDs are UUIDs generated server-side
- Error responses: `HTTPException` with descriptive messages
