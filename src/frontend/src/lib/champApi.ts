/**
 * Centralized API client for the Champ backend.
 *
 * ALL calls go through Next.js /api/proxy routes (server-side) so the
 * browser never needs direct access to the backend — works with
 * port-forwarded / remote environments.
 */

import { useFlowStore } from '@/store/flowStore'

// ── Proxy helper ────────────────────────────────────────────────

async function proxyCall<T = unknown>(
  path: string,
  method: string = 'GET',
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const host = useFlowStore.getState().champHost
  if (!host) throw new Error('Champ host not configured')

  const payload: Record<string, unknown> = {
    host,
    path,
    method,
    body,
  }
  if (extraHeaders) payload.headers = extraHeaders

  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(
      data?.error || `Backend error: ${res.status}`,
    )
  }
  return data as T
}

function authHeaders(): Record<string, string> {
  // Lazy import to avoid circular deps
  const { getStore } = require('@/store/storeRegistry') // eslint-disable-line
  const auth = getStore('auth').getState() as {
    token: string | null
  }
  if (auth.token) {
    return { Authorization: `Bearer ${auth.token}` }
  }
  return {}
}

async function authedCall<T = unknown>(
  path: string,
  method: string = 'GET',
  body?: unknown,
): Promise<T> {
  return proxyCall<T>(
    path,
    method,
    body,
    authHeaders(),
  )
}

// ── SSE stream helper ───────────────────────────────────────────

export type SSEEvent = {
  event: string
  data: Record<string, unknown>
}

export function streamChat(
  agentId: string,
  message: string,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onDone: () => void,
): AbortController {
  const host = useFlowStore.getState().champHost
  const controller = new AbortController()

  // Route through server-side SSE proxy so browser doesn't need
  // direct access to the backend (port-forwarding safe).
  fetch('/api/proxy/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, agentId, message }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text()
        onError(new Error(`Chat error: ${res.status} ${text}`))
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = 'message'

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()! // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6)
            try {
              const data = JSON.parse(raw)
              onEvent({ event: currentEvent, data })
            } catch {
              onEvent({
                event: currentEvent,
                data: { raw },
              })
            }
            currentEvent = 'message'
          }
          // empty line = end of event (already handled by splitting)
        }
      }

      onDone()
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err)
      }
    })

  return controller
}

// ── SSE stream with file upload ─────────────────────────────────

export function streamChatWithFile(
  agentId: string,
  message: string,
  file: File,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onDone: () => void,
): AbortController {
  const host = useFlowStore.getState().champHost
  const controller = new AbortController()

  const formData = new FormData()
  formData.append('host', host)
  formData.append('agentId', agentId)
  formData.append('message', message)
  formData.append('file', file)

  fetch('/api/proxy/upload', {
    method: 'POST',
    body: formData,
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text()
        onError(
          new Error(`Upload error: ${res.status} ${text}`),
        )
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = 'message'

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6)
            try {
              const data = JSON.parse(raw)
              onEvent({ event: currentEvent, data })
            } catch {
              onEvent({
                event: currentEvent,
                data: { raw },
              })
            }
            currentEvent = 'message'
          }
        }
      }

      onDone()
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err)
      }
    })

  return controller
}

// ── Typed API methods ───────────────────────────────────────────

type ApiResult = { status: string; [key: string]: unknown }

export const champApi = {
  // LLM
  configureLlm: (settings: {
    provider: string
    api_key: string
    default_model: string
    base_url?: string | null
  }) =>
    proxyCall<ApiResult>(
      '/llm/configure',
      'POST',
      settings,
    ),

  getLlmStatus: () =>
    proxyCall<ApiResult>('/llm/status', 'GET'),

  // Agents
  addAgent: (agent: {
    agent_id: string
    name: string
    model: string
    agent_config?: {
      llm_config: Record<string, string>
      reasoning_config: Record<string, string>
      tool_config: { tools_list: string[] }
    }
  }) =>
    proxyCall<ApiResult>(
      '/agents/add_single',
      'POST',
      agent,
    ),

  decommissionAgent: (id: string) =>
    proxyCall<ApiResult>(
      `/agents/${id}/decommission`,
      'DELETE',
    ),

  decommissionAll: () =>
    proxyCall<ApiResult>(
      '/agents/decommission_all',
      'DELETE',
    ),

  listAgents: () =>
    proxyCall<{ agents: Record<string, unknown>[] }>(
      '/agents/list',
      'GET',
    ),

  listAgentFiles: (id: string) =>
    proxyCall<{
      agent_id: string
      files: {
        name: string
        size: number
        uploaded_at: string
      }[]
    }>(`/agents/${id}/files`, 'GET'),

  // Connectors
  startConnector: (connector: {
    connector_id: string
    name: string
    protocol: string
    kafka_config?: Record<string, unknown>
    dis_config?: Record<string, unknown>
    uci_config?: Record<string, unknown>
    zmq_config?: Record<string, unknown>
  }) =>
    proxyCall<ApiResult>(
      '/connectors/start',
      'POST',
      connector,
    ),

  stopConnector: (id: string) =>
    proxyCall<ApiResult>(
      `/connectors/${id}/stop`,
      'DELETE',
    ),

  listConnectors: () =>
    proxyCall<{
      connectors: Record<string, unknown>[]
    }>('/connectors/list', 'GET'),

  // Edges
  syncEdges: (
    edges: {
      source_connector: string
      target_agent: string
    }[],
  ) =>
    proxyCall<ApiResult>('/edges/sync', 'POST', {
      edges,
    }),

  // Missions
  createMission: (mission: {
    mission_id: string
    name: string
    description: string
  }) =>
    authedCall<ApiResult>(
      '/missions',
      'POST',
      mission,
    ),

  listMissions: () =>
    authedCall<{
      status: string
      missions: {
        mission_id: string
        user_id: string
        name: string
        description: string
        phase: string
        created_at: string
        updated_at: string
      }[]
    }>('/missions', 'GET'),

  updateMission: (
    id: string,
    updates: {
      name?: string
      description?: string
      phase?: string
    },
  ) =>
    authedCall<ApiResult>(
      `/missions/${id}`,
      'PUT',
      updates,
    ),

  deleteMission: (id: string) =>
    authedCall<ApiResult>(
      `/missions/${id}`,
      'DELETE',
    ),

  saveFlowConfig: (
    missionId: string,
    payload: {
      agents: Record<string, unknown>[]
      connectors: Record<string, unknown>[]
      data_edges: {
        source_connector: string
        target_agent: string
      }[]
    },
  ) =>
    authedCall<ApiResult>(
      `/missions/${missionId}/flow-config`,
      'POST',
      payload,
    ),

  saveFlowSnapshot: (
    missionId: string,
    snapshot: {
      nodes: Record<string, unknown>[]
      edges: Record<string, unknown>[]
    },
  ) =>
    authedCall<ApiResult>(
      `/missions/${missionId}/flow-snapshot`,
      'POST',
      snapshot,
    ),

  getFlowSnapshot: (missionId: string) =>
    authedCall<{
      status: string
      snapshot?: {
        nodes: Record<string, unknown>[]
        edges: Record<string, unknown>[]
      }
      message?: string
    }>(`/missions/${missionId}/flow-snapshot`, 'GET'),

  // Streaming chat
  streamChat,
  streamChatWithFile,
}
