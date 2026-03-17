import asyncio
import hashlib
import json
import logging
import os
import random
import secrets
import shutil
import uuid
import xml.etree.ElementTree as ET
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from xml.dom import minidom

import jwt
from fastapi import FastAPI, File, Form, Header, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_ai.messages import ModelMessage
from sse_starlette.sse import EventSourceResponse

from app.agent_llm import run_agent_stream, run_agent_sync

logger = logging.getLogger("champ")

app = FastAPI(title="Champ API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _on_startup():
    _ensure_default_user()


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
_project_dir = os.environ.get("CHAMP_PROJECT_DIR")
BUILD_ROOT = (
    Path(_project_dir) / ".build"
    if _project_dir
    else Path(__file__).resolve().parent.parent / ".build"
)


def get_workspace(agent_id: str) -> Path:
    ws = BUILD_ROOT / agent_id / "uploads"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


# ── Auth: local JSON user store ──────────────────────────────────
JWT_SECRET = os.environ.get("CHAMP_JWT_SECRET", secrets.token_hex(32))
CHAMP_ROOT = (
    Path(_project_dir) / ".champ"
    if _project_dir
    else Path(__file__).resolve().parent.parent / ".champ"
)
USERS_FILE = CHAMP_ROOT / "users.json"


def _load_users() -> dict:
    if USERS_FILE.exists():
        return json.loads(USERS_FILE.read_text())
    return {}


def _ensure_default_user():
    """Create the default 'champ' account on first run."""
    users = _load_users()
    default_email = "champ@lmco.com"
    if default_email not in users:
        user_id = "champ"
        users[default_email] = {
            "user_id": user_id,
            "email": default_email,
            "name": "champ",
            "password_hash": _hash_password("champ"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_users(users)
        get_user_space(user_id)


def _save_users(users: dict):
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(json.dumps(users, indent=2))


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${h.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    salt, h = stored.split("$", 1)
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 100_000
    )
    return check.hex() == h


def _make_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email}, JWT_SECRET, algorithm="HS256"
    )


def _decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def get_user_space(user_id: str) -> Path:
    """Return (and create) a user's personal workspace directory."""
    space = CHAMP_ROOT / user_id
    space.mkdir(parents=True, exist_ok=True)
    # Create default sub-dirs
    for sub in ("uploads", "flows"):
        (space / sub).mkdir(exist_ok=True)
    return space


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/signup")
async def auth_signup(req: SignupRequest):
    users = _load_users()
    if req.email in users:
        return {"status": "error", "message": "Email already registered"}
    user_id = str(uuid.uuid4())
    users[req.email] = {
        "user_id": user_id,
        "email": req.email,
        "name": req.name or req.email.split("@")[0],
        "password_hash": _hash_password(req.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_users(users)
    space = get_user_space(user_id)
    token = _make_token(user_id, req.email)
    return {
        "status": "success",
        "token": token,
        "user": {
            "user_id": user_id,
            "email": req.email,
            "name": users[req.email]["name"],
            "workspace": str(space),
        },
    }


@app.post("/auth/login")
async def auth_login(req: LoginRequest):
    users = _load_users()
    user = users.get(req.email)
    if not user or not _verify_password(req.password, user["password_hash"]):
        return {"status": "error", "message": "Invalid email or password"}
    space = get_user_space(user["user_id"])
    token = _make_token(user["user_id"], req.email)
    return {
        "status": "success",
        "token": token,
        "user": {
            "user_id": user["user_id"],
            "email": req.email,
            "name": user["name"],
            "workspace": str(space),
        },
    }


@app.get("/auth/me")
async def auth_me(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        return {"status": "error", "message": "Not authenticated"}
    payload = _decode_token(authorization[7:])
    if not payload:
        return {"status": "error", "message": "Invalid token"}
    users = _load_users()
    user = users.get(payload["email"])
    if not user:
        return {"status": "error", "message": "User not found"}
    space = get_user_space(user["user_id"])
    return {
        "status": "success",
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "name": user["name"],
            "workspace": str(space),
        },
    }


# ── Auth helper ──────────────────────────────────────────────────


def _require_user(authorization: str) -> dict | None:
    """Extract user dict from Bearer token, or None."""
    if not authorization.startswith("Bearer "):
        return None
    payload = _decode_token(authorization[7:])
    if not payload:
        return None
    users = _load_users()
    return users.get(payload["email"])


# ── Missions (per-user, directory-based) ─────────────────────────
#
# Structure: .champ/{user_id}/{mission_id}/
#              └── mission.json   (metadata)
#              └── ...            (future: artifacts, uploads, etc.)


class CreateMissionRequest(BaseModel):
    mission_id: str
    name: str
    description: str = ""


class UpdateMissionRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    phase: str | None = None


def _mission_dir(user_id: str, mission_id: str) -> Path:
    d = CHAMP_ROOT / user_id / mission_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _mission_meta(user_id: str, mission_id: str) -> Path:
    return _mission_dir(user_id, mission_id) / "mission.json"


def _load_mission(user_id: str, mission_id: str) -> dict | None:
    f = _mission_meta(user_id, mission_id)
    if f.exists():
        return json.loads(f.read_text())
    return None


def _save_mission(user_id: str, mission: dict):
    f = _mission_meta(user_id, mission["mission_id"])
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(mission, indent=2))


def _list_user_missions(user_id: str) -> list[dict]:
    user_dir = CHAMP_ROOT / user_id
    if not user_dir.exists():
        return []
    result = []
    for meta in sorted(user_dir.glob("*/mission.json")):
        try:
            result.append(json.loads(meta.read_text()))
        except (json.JSONDecodeError, OSError):
            continue
    return result


@app.post("/missions")
async def create_mission(
    req: CreateMissionRequest,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    existing = _load_mission(user["user_id"], req.mission_id)
    if existing:
        return {"status": "error", "message": "Mission already exists"}

    mission = {
        "mission_id": req.mission_id,
        "user_id": user["user_id"],
        "name": req.name,
        "description": req.description,
        "phase": "pre-mission",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_mission(user["user_id"], mission)
    return {"status": "success", "mission": mission}


@app.get("/missions")
async def list_missions(
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    return {
        "status": "success",
        "missions": _list_user_missions(user["user_id"]),
    }


@app.get("/missions/{mission_id}")
async def get_mission(
    mission_id: str,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    mission = _load_mission(user["user_id"], mission_id)
    if not mission:
        return {"status": "error", "message": "Mission not found"}
    return {"status": "success", "mission": mission}


@app.put("/missions/{mission_id}")
async def update_mission(
    mission_id: str,
    req: UpdateMissionRequest,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    mission = _load_mission(user["user_id"], mission_id)
    if not mission:
        return {"status": "error", "message": "Mission not found"}

    if req.name is not None:
        mission["name"] = req.name
    if req.description is not None:
        mission["description"] = req.description
    if req.phase is not None:
        mission["phase"] = req.phase
    mission["updated_at"] = datetime.now(timezone.utc).isoformat()

    _save_mission(user["user_id"], mission)
    return {"status": "success", "mission": mission}


@app.delete("/missions/{mission_id}")
async def delete_mission(
    mission_id: str,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    mission_dir = CHAMP_ROOT / user["user_id"] / mission_id
    if not mission_dir.exists():
        return {"status": "error", "message": "Mission not found"}

    shutil.rmtree(mission_dir)
    return {"status": "success", "message": f"Mission {mission_id} deleted"}


# ── Flow config persistence (agent_config.xml) ───────────────────


class SaveFlowConfigRequest(BaseModel):
    agents: list[dict] = []
    connectors: list[dict] = []
    data_edges: list[dict] = []


def _flow_to_xml(payload: dict) -> str:
    """Convert a serialized flow payload to XML."""
    root = ET.Element(
        "agent_config",
        attrib={
            "version": "1",
            "saved_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    agents_el = ET.SubElement(root, "agents")
    for agent in payload.get("agents", []):
        a_el = ET.SubElement(
            agents_el,
            "agent",
            attrib={"id": agent.get("agent_id", "")},
        )
        ET.SubElement(a_el, "deployment").text = agent.get(
            "deployment", ""
        )
        if agent.get("leader"):
            ET.SubElement(a_el, "leader").text = agent["leader"]
        if agent.get("team_members"):
            tm_el = ET.SubElement(a_el, "team_members")
            for tm in agent["team_members"]:
                ET.SubElement(tm_el, "member").text = str(tm)
        if agent.get("sub_agents"):
            sa_el = ET.SubElement(a_el, "sub_agents")
            for sa in agent["sub_agents"]:
                ET.SubElement(sa_el, "sub_agent").text = str(sa)
        if agent.get("kwargs"):
            ET.SubElement(a_el, "kwargs").text = json.dumps(
                agent["kwargs"]
            )

        cfg = agent.get("agent_config", {})
        cfg_el = ET.SubElement(a_el, "agent_config")
        llm = cfg.get("llm_config", {})
        llm_el = ET.SubElement(cfg_el, "llm_config")
        for k, v in llm.items():
            ET.SubElement(llm_el, k).text = str(v)
        reasoning = cfg.get("reasoning_config", {})
        r_el = ET.SubElement(cfg_el, "reasoning_config")
        for k, v in reasoning.items():
            ET.SubElement(r_el, k).text = str(v)
        tools = cfg.get("tool_config", {})
        t_el = ET.SubElement(cfg_el, "tool_config")
        for tool_name in tools.get("tools_list", []):
            ET.SubElement(t_el, "tool").text = tool_name

    connectors_el = ET.SubElement(root, "connectors")
    for conn in payload.get("connectors", []):
        c_el = ET.SubElement(
            connectors_el,
            "connector",
            attrib={"id": conn.get("connector_id", "")},
        )
        ET.SubElement(c_el, "name").text = conn.get("name", "")
        ET.SubElement(c_el, "protocol").text = conn.get(
            "protocol", ""
        )

        for cfg_key in (
            "kafka_config",
            "dis_config",
            "uci_config",
            "zmq_config",
        ):
            cfg_data = conn.get(cfg_key)
            if cfg_data:
                cfg_el = ET.SubElement(c_el, cfg_key)
                for k, v in cfg_data.items():
                    if isinstance(v, list):
                        list_el = ET.SubElement(cfg_el, k)
                        for item in v:
                            ET.SubElement(
                                list_el, "item"
                            ).text = str(item)
                    else:
                        ET.SubElement(cfg_el, k).text = str(v)

    edges_el = ET.SubElement(root, "data_edges")
    for edge in payload.get("data_edges", []):
        ET.SubElement(
            edges_el,
            "edge",
            attrib={
                "source_connector": edge.get(
                    "source_connector", ""
                ),
                "target_agent": edge.get("target_agent", ""),
            },
        )

    rough = ET.tostring(root, encoding="unicode", xml_declaration=True)
    return minidom.parseString(rough).toprettyxml(indent="  ")


@app.post("/missions/{mission_id}/flow-config")
async def save_flow_config(
    mission_id: str,
    req: SaveFlowConfigRequest,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    mission = _load_mission(user["user_id"], mission_id)
    if not mission:
        return {"status": "error", "message": "Mission not found"}

    xml_str = _flow_to_xml(req.model_dump())
    dest = _mission_dir(user["user_id"], mission_id) / "agent_config.xml"
    dest.write_text(xml_str, encoding="utf-8")

    return {
        "status": "success",
        "path": str(dest),
        "message": f"Flow config saved to {dest.name}",
    }


@app.get("/missions/{mission_id}/flow-config")
async def get_flow_config(
    mission_id: str,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    dest = (
        _mission_dir(user["user_id"], mission_id) / "agent_config.xml"
    )
    if not dest.exists():
        return {
            "status": "error",
            "message": "No flow config saved for this mission",
        }

    return {
        "status": "success",
        "xml": dest.read_text(encoding="utf-8"),
    }


# ── Flow snapshot persistence (full nodes/edges JSON) ────────────


class SaveFlowSnapshotRequest(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


@app.post("/missions/{mission_id}/flow-snapshot")
async def save_flow_snapshot(
    mission_id: str,
    req: SaveFlowSnapshotRequest,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    mission = _load_mission(user["user_id"], mission_id)
    if not mission:
        return {"status": "error", "message": "Mission not found"}

    dest = (
        _mission_dir(user["user_id"], mission_id) / "flow_snapshot.json"
    )
    dest.write_text(
        json.dumps(req.model_dump(), indent=2), encoding="utf-8"
    )
    return {"status": "success", "message": "Flow snapshot saved"}


@app.get("/missions/{mission_id}/flow-snapshot")
async def get_flow_snapshot(
    mission_id: str,
    authorization: str = Header(default=""),
):
    user = _require_user(authorization)
    if not user:
        return {"status": "error", "message": "Not authenticated"}

    dest = (
        _mission_dir(user["user_id"], mission_id) / "flow_snapshot.json"
    )
    if not dest.exists():
        return {
            "status": "error",
            "message": "No flow snapshot for this mission",
        }

    return {
        "status": "success",
        "snapshot": json.loads(dest.read_text(encoding="utf-8")),
    }


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
    return {
        "status": "success",
        "settings": {
            "provider": request.provider,
            "default_model": request.default_model,
            "base_url": request.base_url,
            "api_key_set": bool(request.api_key),
        },
    }


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
        return {
            "status": "error",
            "message": "LLM not configured. POST /llm/configure first.",
        }

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
        return {
            "status": "error",
            "message": "LLM not configured. POST /llm/configure first.",
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
            files.append(
                {
                    "name": f.name,
                    "size": stat.st_size,
                    "uploaded_at": datetime.fromtimestamp(
                        stat.st_mtime, tz=timezone.utc
                    ).isoformat(),
                }
            )
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
            request.agent_config.model_dump() if request.agent_config else {}
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

        sock = socket.socket(
            socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP
        )
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
                        msg["timestamp"] = datetime.now(
                            timezone.utc
                        ).isoformat()
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
        return {
            "status": "error",
            "message": f"Connector {cid} already running",
        }

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
        return {
            "status": "error",
            "message": f"Unsupported protocol: {request.protocol}",
        }

    connector_tasks[cid] = task
    return {"status": "success", "connector_id": cid}


@app.get("/connectors/{connector_id}/data")
async def get_connector_data(
    connector_id: str,
    last_n: int = Query(default=50, ge=1, le=MAX_BUFFER),
):
    if connector_id not in connectors:
        return {
            "status": "error",
            "message": f"Connector {connector_id} not found",
        }
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
        return {
            "status": "error",
            "message": f"Connector {connector_id} not found",
        }
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
        result.append(
            {
                "connector_id": cid,
                "name": info["name"],
                "protocol": info["protocol"],
                "status": info["status"],
                "message_count": info["message_count"],
            }
        )
    return {"connectors": result}
