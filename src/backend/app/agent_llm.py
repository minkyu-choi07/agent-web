"""PydanticAI-based agent LLM service for Anvil.

Provides:
- Agent factory with OpenAI-compatible endpoint support
- Connector data context assembly
- Tool definitions (AGENT_MESSAGE_SERVER, GRAPH_RAG, MDMP_PLAN, TEXT_TO_SQL)
- Streaming execution yielding SSE-formatted events
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.anthropic import AnthropicProvider

logger = logging.getLogger("anvil.agent_llm")

# ---------------------------------------------------------------------------
# Dependency context — passed into every tool call
# ---------------------------------------------------------------------------


@dataclass
class AgentDeps:
    """Runtime dependencies injected into PydanticAI tool calls."""

    agent_id: str
    # References to the in-memory stores (set by main.py)
    agents_store: dict[str, dict]
    connectors_store: dict[str, dict]
    data_edges: list[dict]
    agent_conversations: dict[str, list[ModelMessage]]
    # Function to send a message to another agent (for AGENT_MESSAGE_SERVER)
    send_to_agent: Any | None = None


# ---------------------------------------------------------------------------
# Context assembly — gather connector data for the agent's system prompt
# ---------------------------------------------------------------------------


def build_connector_context(
    agent_id: str,
    connectors_store: dict[str, dict],
    data_edges: list[dict],
    last_n: int = 20,
) -> str:
    """Build a context block from all connectors linked to this agent."""
    # Find connectors connected to this agent
    linked_connector_ids = [
        edge["source_connector"]
        for edge in data_edges
        if edge["target_agent"] == agent_id
    ]

    if not linked_connector_ids:
        return ""

    sections: list[str] = []
    for cid in linked_connector_ids:
        conn = connectors_store.get(cid)
        if not conn:
            continue
        buf = conn.get("data_buffer")
        if not buf:
            continue
        data = list(buf)[-last_n:]
        if not data:
            continue
        sections.append(
            f"### Connector: {conn.get('name', cid)} "
            f"(protocol={conn.get('protocol', '?')}, "
            f"messages={conn.get('message_count', 0)})\n"
            f"```json\n{json.dumps(data, indent=2, default=str)}\n```"
        )

    if not sections:
        return ""
    return "## Live Data Feeds\n\n" + "\n\n".join(sections)


TEXT_EXTENSIONS = {
    ".txt", ".csv", ".json", ".md", ".py", ".js",
    ".ts", ".yaml", ".yml", ".xml", ".html", ".css",
    ".sql", ".sh", ".log", ".ini", ".cfg", ".toml",
    ".env", ".tsv", ".rst",
}
MAX_FILE_CHARS = 4000


def build_file_context(agent_info: dict) -> str:
    """Build context from files in the agent's workspace."""
    workspace = agent_info.get("workspace")
    if not workspace:
        return ""
    ws_path = Path(workspace)
    if not ws_path.exists():
        return ""

    files = sorted(ws_path.iterdir())
    if not files:
        return ""

    sections: list[str] = []
    for f in files:
        if not f.is_file():
            continue
        size = f.stat().st_size
        ext = f.suffix.lower()

        if ext in TEXT_EXTENSIONS and size > 0:
            try:
                text = f.read_text(errors="replace")
                if len(text) > MAX_FILE_CHARS:
                    text = (
                        text[:MAX_FILE_CHARS]
                        + f"\n\n... [truncated, {size} bytes total]"
                    )
                sections.append(
                    f"### {f.name} ({size} bytes)\n"
                    f"```\n{text}\n```"
                )
            except Exception:
                sections.append(
                    f"### {f.name} ({size} bytes) — could not read"
                )
        else:
            sections.append(
                f"### {f.name} ({size} bytes, {ext or 'binary'})"
            )

    if not sections:
        return ""
    return "## Agent Workspace Files\n\n" + "\n\n".join(sections)


def build_system_prompt(
    agent_id: str,
    agent_info: dict,
    connectors_store: dict[str, dict],
    data_edges: list[dict],
) -> str:
    """Assemble the full system prompt for an agent."""
    name = agent_info.get("name", "Agent")
    agent_config = agent_info.get("agent_config", {})

    parts: list[str] = [
        f"You are **{name}** (id: {agent_id}), an AI agent in the Anvil system.",
        "",
        "Your role is to analyse incoming data from connected sensors and "
        "data feeds, answer questions, and use your available tools when "
        "needed to fulfil the user's request.",
    ]

    # Add reasoning module hint if configured
    reasoning = agent_config.get("reasoning_config", {})
    if reasoning.get("reasoning_name"):
        parts.append(
            f"\nReasoning module: {reasoning['reasoning_name']}"
        )

    # Add live connector data
    ctx = build_connector_context(
        agent_id, connectors_store, data_edges
    )
    if ctx:
        parts.append("")
        parts.append(ctx)

    # Add workspace files
    file_ctx = build_file_context(agent_info)
    if file_ctx:
        parts.append("")
        parts.append(file_ctx)

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------


def create_model(
    llm_settings: dict,
    agent_info: dict,
) -> OpenAIModel | AnthropicModel:
    """Create a model from settings. Supports OpenAI and Anthropic providers."""
    agent_config = agent_info.get("agent_config", {})
    llm_config = agent_config.get("llm_config", {})
    provider = llm_settings.get("provider", "openai")

    # Per-agent endpoint/model override, fall back to global settings
    model_name = (
        llm_config.get("model_name")
        or agent_info.get("model")
        or llm_settings.get("default_model", "gpt-4o")
    )
    base_url = (
        llm_config.get("endpoint")
        or llm_settings.get("base_url")
        or None
    )
    api_key = llm_settings.get("api_key", "")

    if provider == "anthropic":
        anthropic_provider = AnthropicProvider(api_key=api_key) if api_key else "anthropic"
        return AnthropicModel(model_name, provider=anthropic_provider)

    # Default: OpenAI-compatible
    kwargs = {}
    if base_url:
        kwargs["base_url"] = base_url
    if api_key:
        kwargs["api_key"] = api_key
    return OpenAIModel(model_name, **kwargs)


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------


def _make_agent_message_tool(agent: Agent[AgentDeps, str]):
    """Register AGENT_MESSAGE_SERVER tool — send a message to another agent."""

    @agent.tool
    async def send_agent_message(
        ctx: RunContext[AgentDeps],
        target_agent_id: str,
        message: str,
    ) -> str:
        """Send a message to another agent in the system.

        Args:
            target_agent_id: The ID of the agent to send the message to.
            message: The message content to send.
        """
        store = ctx.deps.agents_store
        if target_agent_id not in store:
            return f"Error: Agent {target_agent_id} not found."
        # If a send function is provided, use it
        if ctx.deps.send_to_agent:
            result = await ctx.deps.send_to_agent(
                target_agent_id, message
            )
            return json.dumps(result, default=str)
        return (
            f"Message delivered to agent {target_agent_id}: "
            f"{message[:200]}"
        )


def _make_graph_rag_tool(agent: Agent[AgentDeps, str]):
    """Register GRAPH_RAG_CLOUD_SERVER tool — query a graph RAG service."""

    @agent.tool
    async def query_graph_rag(
        ctx: RunContext[AgentDeps],
        query: str,
    ) -> str:
        """Query the Graph RAG knowledge base for relevant information.

        Args:
            query: Natural language query to search the knowledge graph.
        """
        # TODO: wire to actual Graph RAG endpoint
        logger.info("graph_rag query: %s", query)
        return json.dumps({
            "status": "stub",
            "query": query,
            "results": [],
            "message": (
                "Graph RAG service not yet connected. "
                "Configure the endpoint in agent settings."
            ),
        })


def _make_mdmp_plan_tool(agent: Agent[AgentDeps, str]):
    """Register MDMP_PLAN_SERVER tool — military decision making process."""

    @agent.tool
    async def query_mdmp_plan(
        ctx: RunContext[AgentDeps],
        query: str,
        plan_phase: str = "analysis",
    ) -> str:
        """Query the MDMP (Military Decision Making Process) planning server.

        Args:
            query: The planning question or request.
            plan_phase: The MDMP phase (e.g. 'analysis', 'coa_development',
                        'coa_comparison', 'orders_production').
        """
        logger.info("mdmp_plan query: phase=%s, q=%s", plan_phase, query)
        return json.dumps({
            "status": "stub",
            "query": query,
            "phase": plan_phase,
            "results": [],
            "message": (
                "MDMP Plan service not yet connected. "
                "Configure the endpoint in agent settings."
            ),
        })


def _make_text_to_sql_tool(agent: Agent[AgentDeps, str]):
    """Register TEXT_TO_SQL_CLOUD_SERVER tool — NL to SQL conversion."""

    @agent.tool
    async def text_to_sql(
        ctx: RunContext[AgentDeps],
        question: str,
        database_context: str = "",
    ) -> str:
        """Convert a natural language question into a SQL query and execute it.

        Args:
            question: The natural language question to convert to SQL.
            database_context: Optional schema or context about the database.
        """
        logger.info("text_to_sql: %s", question)
        return json.dumps({
            "status": "stub",
            "question": question,
            "sql": None,
            "results": [],
            "message": (
                "Text-to-SQL service not yet connected. "
                "Configure the endpoint in agent settings."
            ),
        })


# Tool name → registration function
TOOL_REGISTRY: dict[str, Any] = {
    "AGENT_MESSAGE_SERVER": _make_agent_message_tool,
    "GRAPH_RAG_CLOUD_SERVER": _make_graph_rag_tool,
    "MDMP_PLAN_SERVER": _make_mdmp_plan_tool,
    "TEXT_TO_SQL_CLOUD_SERVER": _make_text_to_sql_tool,
}


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------


def create_agent(
    agent_id: str,
    agent_info: dict,
    llm_settings: dict,
    connectors_store: dict[str, dict],
    data_edges: list[dict],
) -> Agent[AgentDeps, str]:
    """Create a PydanticAI agent configured from the agent's settings."""
    model = create_model(llm_settings, agent_info)
    system_prompt = build_system_prompt(
        agent_id, agent_info, connectors_store, data_edges
    )

    agent = Agent(
        model,
        system_prompt=system_prompt,
        deps_type=AgentDeps,
        output_type=str,
        retries=2,
    )

    # Register tools based on agent's tool_config
    agent_config = agent_info.get("agent_config", {})
    tools_list = (
        agent_config.get("tool_config", {}).get("tools_list", [])
    )
    for tool_name in tools_list:
        registrar = TOOL_REGISTRY.get(tool_name)
        if registrar:
            registrar(agent)
        else:
            logger.warning(
                "Unknown tool %s for agent %s", tool_name, agent_id
            )

    return agent


# ---------------------------------------------------------------------------
# Streaming execution
# ---------------------------------------------------------------------------


async def run_agent_stream(
    agent_id: str,
    user_message: str,
    agent_info: dict,
    llm_settings: dict,
    agents_store: dict[str, dict],
    connectors_store: dict[str, dict],
    data_edges: list[dict],
    agent_conversations: dict[str, list[ModelMessage]],
):
    """Run the agent and yield SSE event dicts.

    Yields dicts like:
        {"event": "status", "data": {"status": "thinking"}}
        {"event": "tool_call", "data": {"tool": "...", "args": {...}}}
        {"event": "tool_result", "data": {"tool": "...", "result": "..."}}
        {"event": "delta", "data": {"text": "..."}}
        {"event": "done", "data": {"full_response": "..."}}
        {"event": "error", "data": {"message": "..."}}
    """
    try:
        yield {"event": "status", "data": {"status": "initializing"}}

        agent = create_agent(
            agent_id,
            agent_info,
            llm_settings,
            connectors_store,
            data_edges,
        )

        deps = AgentDeps(
            agent_id=agent_id,
            agents_store=agents_store,
            connectors_store=connectors_store,
            data_edges=data_edges,
            agent_conversations=agent_conversations,
        )

        # Get conversation history for this agent
        message_history = agent_conversations.get(agent_id)

        yield {"event": "status", "data": {"status": "thinking"}}

        async with agent.run_stream(
            user_message,
            deps=deps,
            message_history=message_history,
        ) as result:
            # Stream text chunks as they arrive
            full_text = ""
            async for chunk in result.stream_text(delta=True):
                full_text += chunk
                yield {"event": "delta", "data": {"text": chunk}}

            # After streaming, inspect the messages for tool calls
            all_messages = result.all_messages()

            # Extract tool call/result events from the message history
            for msg in all_messages:
                if isinstance(msg, ModelResponse):
                    for part in msg.parts:
                        if isinstance(part, ToolCallPart):
                            yield {
                                "event": "tool_call",
                                "data": {
                                    "tool": part.tool_name,
                                    "args": (
                                        part.args
                                        if isinstance(part.args, dict)
                                        else json.loads(part.args)
                                        if isinstance(part.args, str)
                                        else {}
                                    ),
                                },
                            }
                elif isinstance(msg, ModelRequest):
                    for part in msg.parts:
                        if isinstance(part, ToolReturnPart):
                            yield {
                                "event": "tool_result",
                                "data": {
                                    "tool": part.tool_name,
                                    "result": part.content,
                                },
                            }

            # Save conversation history
            agent_conversations[agent_id] = list(all_messages)

            yield {
                "event": "done",
                "data": {"full_response": full_text},
            }

    except ModelRetry as e:
        yield {
            "event": "error",
            "data": {"message": f"Model retry exhausted: {e}"},
        }
    except Exception as e:
        logger.exception("Agent %s stream error", agent_id)
        yield {
            "event": "error",
            "data": {"message": str(e)},
        }


# ---------------------------------------------------------------------------
# Sync (non-streaming) execution
# ---------------------------------------------------------------------------


async def run_agent_sync(
    agent_id: str,
    user_message: str,
    agent_info: dict,
    llm_settings: dict,
    agents_store: dict[str, dict],
    connectors_store: dict[str, dict],
    data_edges: list[dict],
    agent_conversations: dict[str, list[ModelMessage]],
) -> dict:
    """Run the agent and return the full response (non-streaming)."""
    agent = create_agent(
        agent_id,
        agent_info,
        llm_settings,
        connectors_store,
        data_edges,
    )

    deps = AgentDeps(
        agent_id=agent_id,
        agents_store=agents_store,
        connectors_store=connectors_store,
        data_edges=data_edges,
        agent_conversations=agent_conversations,
    )

    message_history = agent_conversations.get(agent_id)

    result = await agent.run(
        user_message,
        deps=deps,
        message_history=message_history,
    )

    # Save conversation history
    agent_conversations[agent_id] = list(result.all_messages())

    # Collect tool usage info
    tool_calls = []
    for msg in result.all_messages():
        if isinstance(msg, ModelResponse):
            for part in msg.parts:
                if isinstance(part, ToolCallPart):
                    tool_calls.append({
                        "tool": part.tool_name,
                        "args": (
                            part.args
                            if isinstance(part.args, dict)
                            else json.loads(part.args)
                            if isinstance(part.args, str)
                            else {}
                        ),
                    })

    return {
        "response": result.output,
        "tool_calls": tool_calls,
        "usage": {
            "total_tokens": (
                result.usage().total_tokens
                if result.usage()
                else None
            ),
        },
    }
