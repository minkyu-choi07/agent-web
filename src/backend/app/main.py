import asyncio
import json
import logging
import os
import random
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_ai.messages import ModelMessage
from sse_starlette.sse import EventSourceResponse

from app.agent_llm import run_agent_stream, run_agent_sync

logger = logging.getLogger("anvil")

app = FastAPI(title="Anvil API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory agent store ────────────────────────────────────────
agents: dict[str, dict] = {}
agent_tasks: dict[str, asyncio.Task] = {}

# ── LLM settings (global) ───────────────────────────────────────
llm_settings: dict = {
    "provider": "openai",
    "api_key": "",
    "default_model": "gpt-4o",
    "base_url": None,
}

# ── Data edges (connector → agent) ──────────────────────────────
data_edges: list[dict] = []

# ── Per-agent conversation history ──────────────────────────────
agent_conversations: dict[str, list[ModelMessage]] = {}

# ── Agent workspace ─────────────────────────────────────────────
BUILD_ROOT = Path(__file__).resolve().parent.parent / ".build"


def get_workspace(agent_id: str) -> Path:
    ws = BUILD_ROOT / agent_id / "uploads"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


# ── Schemas ──────────────────────────────────────────────────────
class AgentMessageRequest(BaseModel):
    agent_id: str
    message: str


class AgentSingle(BaseModel):
    agent_id: str | None = None
    name: str
    model: str = "gpt-4o"


class AgentBatchPayload(BaseModel):
    agents: list[AgentSingle]


class LlmSettingsRequest(BaseModel):
    provider: str = "openai"
    api_key: str = ""
    default_model: str = "gpt-4o"
    base_url: str | None = None


class DataEdge(BaseModel):
    source_connector: str
    target_agent: str


class EdgeSyncRequest(BaseModel):
    edges: list[DataEdge]


class ChatRequest(BaseModel):
    message: str


class AgentConfigPayload(BaseModel):
    """Full agent config sent from the frontend."""
    llm_config: dict = {}
    reasoning_config: dict = {}
    tool_config: dict = {}


class AgentSingleFull(BaseModel):
    """Extended agent creation with full config."""
    agent_id: str | None = None
    name: str
    model: str = "gpt-4o"
    agent_config: AgentConfigPayload | None = None


# ── Background agent loop ────────────────────────────────────────

async def agent_run_loop(agent_id: str):
    """Simulate a long-running agent process."""
    try:
        while True:
            agents[agent_id]["status"] = "running"
            await asyncio.sleep(5)
    except asyncio.CancelledError:
        agents.get(agent_id, {})["status"] = "stopped"


def start_agent_task(agent_id: str):
    task = asyncio.create_task(agent_run_loop(agent_id))
    agent_tasks[agent_id] = task


async def stop_agent_task(agent_id: str):
    task = agent_tasks.pop(agent_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# ── Health ───────────────────────────────────────────────────────


@app.get("/ping")
async def ping():
    return {"message": "pong"}


@app.get("/health_check")
async def health_check():
    return {"status": "ok"}


@app.get("/llm/status")
async def get_llm_status():
    configured = bool(llm_settings.get("api_key"))
    return {
        "status": "configured" if configured else "not_configured",
        "provider": llm_settings.get("provider", "openai"),
        "model": llm_settings.get("default_model", "gpt-4o"),
        "base_url": llm_settings.get("base_url"),
    }


@app.post("/llm/configure")
async def configure_llm(request: LlmSettingsRequest):
    llm_settings["provider"] = request.provider
    llm_settings["api_key"] = request.api_key
    llm_settings["default_model"] = request.default_model
    llm_settings["base_url"] = request.base_url
    return {"status": "success", "settings": {
        "provider": request.provider,
        "default_model": request.default_model,
        "base_url": request.base_url,
        "api_key_set": bool(request.api_key),
    }}


# ── Data Edges ──────────────────────────────────────────────────


@app.post("/edges/sync")
async def sync_edges(request: EdgeSyncRequest):
    global data_edges
    data_edges = [e.model_dump() for e in request.edges]
    return {"status": "success", "edge_count": len(data_edges)}


@app.get("/edges/list")
async def list_edges():
    return {"edges": data_edges}


# ── Messaging (Legacy + New) ────────────────────────────────────


@app.post("/send/{agent_id}")
async def send_message(agent_id: str, request: AgentMessageRequest):
    """Legacy echo endpoint — now proxies to sync chat if LLM is configured."""
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}
    if not llm_settings.get("api_key"):
        return {
            "status": "success",
            "agent_id": agent_id,
            "response": f"Echo: {request.message}",
        }
    result = await run_agent_sync(
        agent_id=agent_id,
        user_message=request.message,
        agent_info=agents[agent_id],
        llm_settings=llm_settings,
        agents_store=agents,
        connectors_store=connectors,
        data_edges=data_edges,
        agent_conversations=agent_conversations,
    )
    return {
        "status": "success",
        "agent_id": agent_id,
        "response": result["response"],
        "tool_calls": result.get("tool_calls", []),
    }


@app.post("/agents/{agent_id}/chat")
async def agent_chat(agent_id: str, request: ChatRequest):
    """Send a message to an agent, get streaming SSE response."""
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}
    if not llm_settings.get("api_key"):
        return {"status": "error", "message": "LLM not configured. POST /llm/configure first."}

    async def event_generator():
        async for event in run_agent_stream(
            agent_id=agent_id,
            user_message=request.message,
            agent_info=agents[agent_id],
            llm_settings=llm_settings,
            agents_store=agents,
            connectors_store=connectors,
            data_edges=data_edges,
            agent_conversations=agent_conversations,
        ):
            yield {
                "event": event["event"],
                "data": json.dumps(event["data"], default=str),
            }

    return EventSourceResponse(event_generator())


@app.post("/agents/{agent_id}/chat/sync")
async def agent_chat_sync(agent_id: str, request: ChatRequest):
    """Send a message and wait for full response (non-streaming)."""
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}
    if not llm_settings.get("api_key"):
        return {"status": "error", "message": "LLM not configured. POST /llm/configure first."}

    result = await run_agent_sync(
        agent_id=agent_id,
        user_message=request.message,
        agent_info=agents[agent_id],
        llm_settings=llm_settings,
        agents_store=agents,
        connectors_store=connectors,
        data_edges=data_edges,
        agent_conversations=agent_conversations,
    )
    return {"status": "success", "agent_id": agent_id, **result}


@app.post("/send/agent/{agent_id}/attachment")
async def send_message_with_attachment(
    agent_id: str,
    file: UploadFile = File(...),  # noqa: B008
    message: str = Form(""),  # noqa: B008
):
    """Upload a file to an agent's workspace and optionally send a message."""
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}

    workspace = get_workspace(agent_id)
    filename = file.filename or f"upload-{uuid.uuid4().hex[:8]}"
    # Sanitize filename
    safe_name = Path(filename).name
    dest = workspace / safe_name

    content = await file.read()
    dest.write_bytes(content)

    return {
        "status": "success",
        "agent_id": agent_id,
        "filename": safe_name,
        "size": len(content),
        "path": str(dest),
        "message": message,
    }


@app.get("/agents/{agent_id}/files")
async def list_agent_files(agent_id: str):
    """List files in an agent's workspace."""
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}
    workspace = get_workspace(agent_id)
    files = []
    for f in sorted(workspace.iterdir()):
        if f.is_file():
            stat = f.stat()
            files.append({
                "name": f.name,
                "size": stat.st_size,
                "uploaded_at": datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat(),
            })
    return {"agent_id": agent_id, "files": files}


@app.post("/agents/{agent_id}/chat/upload")
async def agent_chat_with_file(
    agent_id: str,
    file: UploadFile = File(...),  # noqa: B008
    message: str = Form(""),  # noqa: B008
):
    """Upload a file and chat with the agent (SSE streaming)."""
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}
    if not llm_settings.get("api_key"):
        return {"status": "error", "message": "LLM not configured."}

    # Save file
    workspace = get_workspace(agent_id)
    filename = file.filename or f"upload-{uuid.uuid4().hex[:8]}"
    safe_name = Path(filename).name
    dest = workspace / safe_name
    content = await file.read()
    dest.write_bytes(content)

    # Build message with file context
    user_message = message or f"I've uploaded a file: {safe_name}"
    user_message += f"\n\n[File uploaded: {safe_name} ({len(content)} bytes)]"

    async def event_generator():
        async for event in run_agent_stream(
            agent_id=agent_id,
            user_message=user_message,
            agent_info=agents[agent_id],
            llm_settings=llm_settings,
            agents_store=agents,
            connectors_store=connectors,
            data_edges=data_edges,
            agent_conversations=agent_conversations,
        ):
            yield {
                "event": event["event"],
                "data": json.dumps(event["data"], default=str),
            }

    return EventSourceResponse(event_generator())


# ── Agent Management ─────────────────────────────────────────────


@app.post("/agents/add_single")
async def add_agent_single(request: AgentSingleFull):
    agent_id = request.agent_id or str(uuid.uuid4())
    workspace = get_workspace(agent_id)
    agents[agent_id] = {
        "agent_id": agent_id,
        "name": request.name,
        "model": request.model,
        "status": "starting",
        "workspace": str(workspace),
        "agent_config": (
            request.agent_config.model_dump()
            if request.agent_config
            else {}
        ),
    }
    start_agent_task(agent_id)
    return {"status": "success", "agent_id": agent_id}


@app.post("/agents/add_batch")
async def add_agent_batch(request: AgentBatchPayload):
    results = []
    for agent in request.agents:
        agent_id = agent.agent_id or str(uuid.uuid4())
        agents[agent_id] = {
            "agent_id": agent_id,
            "name": agent.name,
            "model": agent.model,
            "status": "starting",
        }
        start_agent_task(agent_id)
        results.append({"status": "success", "agent_id": agent_id})
    return {"results": results}


# ── Agent Listing ────────────────────────────────────────────────


@app.get("/agents/list")
async def list_agents():
    return {"agents": list(agents.values())}


# ── Agent Health ─────────────────────────────────────────────────


@app.get("/agents/{agent_id}/health")
async def check_agent_health(agent_id: str):
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}
    return {"agent_id": agent_id, "status": "healthy"}


@app.get("/agents/health")
async def check_health():
    return {
        "agents": dict.fromkeys(agents, "healthy"),
    }


# ── Agent Decommissioning ───────────────────────────────────────


@app.delete("/agents/{agent_id}/decommission")
async def decommission_agent(agent_id: str):
    if agent_id not in agents:
        return {"status": "error", "message": f"Agent {agent_id} not found"}
    await stop_agent_task(agent_id)
    del agents[agent_id]
    agent_conversations.pop(agent_id, None)
    return {"status": "success", "message": f"Agent {agent_id} decommissioned"}


@app.delete("/agents/decommission_all")
async def decommission_all_agents():
    count = len(agents)
    for agent_id in list(agent_tasks):
        await stop_agent_task(agent_id)
    agents.clear()
    agent_conversations.clear()
    return {"status": "success", "message": f"{count} agents decommissioned"}


# ── Connector Schemas ──────────────────────────────────────────


class KafkaConnectorConfig(BaseModel):
    brokers: str = "localhost:9092"
    topic: str
    group_id: str = ""


class DisConnectorConfig(BaseModel):
    multicast_address: str = "239.1.2.3"
    port: int = 3000
    exercise_id: int = 1
    entity_types: list[str] = []


class UciConnectorConfig(BaseModel):
    host: str = "localhost"
    port: int = 4000


class ZmqConnectorConfig(BaseModel):
    endpoint: str = "tcp://localhost:5555"
    topic: str = ""


class ConnectorStartRequest(BaseModel):
    connector_id: str | None = None
    name: str = "Connector"
    protocol: str = "zmq"
    kafka_config: KafkaConnectorConfig | None = None
    dis_config: DisConnectorConfig | None = None
    uci_config: UciConnectorConfig | None = None
    zmq_config: ZmqConnectorConfig | None = None


# ── In-memory connector store ─────────────────────────────────

connectors: dict[str, dict] = {}
connector_tasks: dict[str, asyncio.Task] = {}

MAX_BUFFER = 200


# ── Async consumer loops ──────────────────────────────────────


async def kafka_consumer_loop(connector_id: str, config: KafkaConnectorConfig):
    """Consume from a Kafka topic. Falls back to mock data if aiokafka is not installed."""
    use_real = False
    try:
        from aiokafka import AIOKafkaConsumer  # type: ignore[import-untyped]

        use_real = True
    except ImportError:
        use_real = False

    if use_real:
        consumer = AIOKafkaConsumer(
            config.topic,
            bootstrap_servers=config.brokers,
            group_id=config.group_id or None,
            auto_offset_reset="latest",
        )
        try:
            await consumer.start()
            connectors[connector_id]["status"] = "running"
            async for msg in consumer:
                if connector_id not in connectors:
                    break
                try:
                    data = json.loads(msg.value.decode("utf-8"))
                except Exception:
                    data = {"raw": msg.value.decode("utf-8", errors="replace")}
                buf = connectors[connector_id]["data_buffer"]
                buf.append(data)
                connectors[connector_id]["message_count"] += 1
        except asyncio.CancelledError:
            pass
        finally:
            await consumer.stop()
    else:
        # Mock mode — generate synthetic asset data
        connectors[connector_id]["status"] = "running (mock)"
        mock_assets = ["DDG_1", "DDG_2", "DDG_3", "CG_1", "FFG_1"]
        positions: dict[str, dict] = {}
        for asset in mock_assets:
            positions[asset] = {
                "lat": 34.0 + random.uniform(-1, 1),
                "lon": -118.0 + random.uniform(-1, 1),
                "heading": random.uniform(0, 360),
                "speed": random.uniform(5, 25),
            }
        try:
            while connector_id in connectors:
                for asset in mock_assets:
                    p = positions[asset]
                    p["lat"] += random.gauss(0, 0.001)
                    p["lon"] += random.gauss(0, 0.001)
                    p["heading"] = (p["heading"] + random.gauss(0, 2)) % 360
                    p["speed"] = max(0, p["speed"] + random.gauss(0, 0.5))
                    record = {
                        "asset_id": asset,
                        "lat": round(p["lat"], 6),
                        "lon": round(p["lon"], 6),
                        "heading": round(p["heading"], 1),
                        "speed": round(p["speed"], 1),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    buf = connectors[connector_id]["data_buffer"]
                    buf.append(record)
                    connectors[connector_id]["message_count"] += 1
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass


async def dis_listener_loop(connector_id: str, config: DisConnectorConfig):
    """Listen for DIS PDUs via multicast. Falls back to mock data if opendis is not installed."""
    use_real = False
    try:
        import opendis  # type: ignore[import-untyped]  # noqa: F401

        use_real = True
    except ImportError:
        use_real = False

    if use_real:
        import socket
        import struct

        from opendis.dis7 import EntityStatePdu  # type: ignore[import-untyped]
        from opendis.PduFactory import createPdu  # type: ignore[import-untyped]

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("", config.port))
        mreq = struct.pack(
            "4sl",
            socket.inet_aton(config.multicast_address),
            socket.INADDR_ANY,
        )
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        sock.setblocking(False)
        connectors[connector_id]["status"] = "running"
        loop = asyncio.get_event_loop()
        try:
            while connector_id in connectors:
                try:
                    data = await asyncio.wait_for(
                        loop.run_in_executor(None, sock.recv, 65535),
                        timeout=2.0,
                    )
                    pdu = createPdu(data)
                    if isinstance(pdu, EntityStatePdu):
                        record = {
                            "entity_id": str(pdu.entityID),
                            "lat": pdu.entityLocation.x,
                            "lon": pdu.entityLocation.y,
                            "alt": pdu.entityLocation.z,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                        buf = connectors[connector_id]["data_buffer"]
                        buf.append(record)
                        connectors[connector_id]["message_count"] += 1
                except (TimeoutError, asyncio.TimeoutError):
                    continue
        except asyncio.CancelledError:
            pass
        finally:
            sock.close()
    else:
        # Mock mode — generate synthetic DIS-like entity state data
        connectors[connector_id]["status"] = "running (mock)"
        entities = [
            {"entity_id": "1:1:1", "force": "friendly"},
            {"entity_id": "1:1:2", "force": "friendly"},
            {"entity_id": "2:1:1", "force": "opposing"},
        ]
        positions: dict[str, dict] = {}
        for ent in entities:
            positions[ent["entity_id"]] = {
                "lat": 34.0 + random.uniform(-0.5, 0.5),
                "lon": -118.0 + random.uniform(-0.5, 0.5),
                "alt": 0.0,
            }
        try:
            while connector_id in connectors:
                for ent in entities:
                    eid = ent["entity_id"]
                    p = positions[eid]
                    p["lat"] += random.gauss(0, 0.0005)
                    p["lon"] += random.gauss(0, 0.0005)
                    record = {
                        "entity_id": eid,
                        "force": ent["force"],
                        "lat": round(p["lat"], 6),
                        "lon": round(p["lon"], 6),
                        "alt": round(p["alt"], 1),
                        "exercise_id": config.exercise_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    buf = connectors[connector_id]["data_buffer"]
                    buf.append(record)
                    connectors[connector_id]["message_count"] += 1
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass


async def zmq_subscriber_loop(connector_id: str, config: ZmqConnectorConfig):
    """Subscribe to a ZMQ PUB socket. Falls back to mock if pyzmq not installed."""
    use_real = False
    try:
        import zmq  # type: ignore[import-untyped]
        import zmq.asyncio  # type: ignore[import-untyped]

        use_real = True
    except ImportError:
        use_real = False

    if use_real:
        ctx = zmq.asyncio.Context()
        sock = ctx.socket(zmq.SUB)
        sock.connect(config.endpoint)
        topic_filter = config.topic.encode("utf-8") if config.topic else b""
        sock.subscribe(topic_filter)
        connectors[connector_id]["status"] = "running"
        try:
            while connector_id in connectors:
                try:
                    msg = await asyncio.wait_for(sock.recv_json(), timeout=2.0)
                    buf = connectors[connector_id]["data_buffer"]
                    if isinstance(msg, dict):
                        msg["timestamp"] = datetime.now(timezone.utc).isoformat()
                    buf.append(msg)
                    connectors[connector_id]["message_count"] += 1
                except (TimeoutError, asyncio.TimeoutError):
                    continue
        except asyncio.CancelledError:
            pass
        finally:
            sock.close()
            ctx.term()
    else:
        # Mock mode
        connectors[connector_id]["status"] = "running (mock)"
        mock_assets = ["DDG_1", "DDG_2", "DDG_3", "CG_1", "FFG_1"]
        positions: dict[str, dict] = {}
        for asset in mock_assets:
            positions[asset] = {
                "lat": 34.0 + random.uniform(-1, 1),
                "lon": -118.0 + random.uniform(-1, 1),
                "heading": random.uniform(0, 360),
                "speed": random.uniform(5, 25),
            }
        try:
            while connector_id in connectors:
                for asset in mock_assets:
                    p = positions[asset]
                    p["lat"] += random.gauss(0, 0.001)
                    p["lon"] += random.gauss(0, 0.001)
                    p["heading"] = (p["heading"] + random.gauss(0, 2)) % 360
                    p["speed"] = max(0, p["speed"] + random.gauss(0, 0.5))
                    record = {
                        "asset_id": asset,
                        "lat": round(p["lat"], 6),
                        "lon": round(p["lon"], 6),
                        "heading": round(p["heading"], 1),
                        "speed": round(p["speed"], 1),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    buf = connectors[connector_id]["data_buffer"]
                    buf.append(record)
                    connectors[connector_id]["message_count"] += 1
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass


# ── Connector Endpoints ───────────────────────────────────────


@app.post("/connectors/start")
async def start_connector(request: ConnectorStartRequest):
    cid = request.connector_id or str(uuid.uuid4())
    if cid in connectors:
        return {"status": "error", "message": f"Connector {cid} already running"}

    connectors[cid] = {
        "connector_id": cid,
        "name": request.name,
        "protocol": request.protocol,
        "status": "starting",
        "data_buffer": deque(maxlen=MAX_BUFFER),
        "message_count": 0,
    }

    if request.protocol == "zmq":
        cfg = request.zmq_config or ZmqConnectorConfig()
        task = asyncio.create_task(zmq_subscriber_loop(cid, cfg))
    elif request.protocol == "kafka":
        cfg = request.kafka_config or KafkaConnectorConfig(topic="sim-assets")
        task = asyncio.create_task(kafka_consumer_loop(cid, cfg))
    elif request.protocol == "dis":
        cfg = request.dis_config or DisConnectorConfig()
        task = asyncio.create_task(dis_listener_loop(cid, cfg))
    else:
        del connectors[cid]
        return {"status": "error", "message": f"Unsupported protocol: {request.protocol}"}

    connector_tasks[cid] = task
    return {"status": "success", "connector_id": cid}


@app.get("/connectors/{connector_id}/data")
async def get_connector_data(
    connector_id: str,
    last_n: int = Query(default=50, ge=1, le=MAX_BUFFER),
):
    if connector_id not in connectors:
        return {"status": "error", "message": f"Connector {connector_id} not found"}
    buf = connectors[connector_id]["data_buffer"]
    data = list(buf)[-last_n:]
    return {
        "connector_id": connector_id,
        "protocol": connectors[connector_id]["protocol"],
        "message_count": connectors[connector_id]["message_count"],
        "data": data,
    }


@app.delete("/connectors/{connector_id}/stop")
async def stop_connector(connector_id: str):
    if connector_id not in connectors:
        return {"status": "error", "message": f"Connector {connector_id} not found"}
    task = connector_tasks.pop(connector_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    info = connectors.pop(connector_id)
    return {
        "status": "success",
        "message": f"Connector {connector_id} stopped",
        "total_messages": info["message_count"],
    }


@app.get("/connectors/list")
async def list_connectors():
    result = []
    for cid, info in connectors.items():
        result.append({
            "connector_id": cid,
            "name": info["name"],
            "protocol": info["protocol"],
            "status": info["status"],
            "message_count": info["message_count"],
        })
    return {"connectors": result}
