/**
 * Mission snapshot helpers — save/load/delete per-mission state
 * to localStorage. Uses store registry to avoid circular imports.
 * Falls back to backend flow_snapshot.json when localStorage is empty.
 */

import type { Edge } from '@xyflow/react'
import type { AppNode } from '@/store/flowStore'
import type { ChatMessage } from '@/store/chatStore'
import type {
  Mission,
  MapEntity,
  MapLayerVisibility,
  MapViewport,
} from '@/store/missionStore'
import { getStore } from '@/store/storeRegistry'
import { champApi } from '@/lib/champApi'

// ── localStorage key helpers ─────────────────────────────────────

function flowKey(id: string) {
  return `champ-msn-${id}-flow`
}
function chatKey(id: string) {
  return `champ-msn-${id}-chat`
}
function missionDataKey(id: string) {
  return `champ-msn-${id}-data`
}

// ── Snapshot types ───────────────────────────────────────────────

type FlowSnapshot = {
  nodes: AppNode[]
  edges: Edge[]
}

type ChatSnapshot = {
  conversations: Record<string, ChatMessage[]>
}

type MissionDataSnapshot = {
  mission: Mission
  entities: MapEntity[]
  layerVisibility: MapLayerVisibility
  viewport: MapViewport
  scenarioAgentId: string | null
}

// ── Save ─────────────────────────────────────────────────────────

export function saveMissionSnapshot(
  missionId: string,
): void {
  const flow = getStore('flow').getState() as {
    nodes: AppNode[]
    edges: Edge[]
  }
  const chat = getStore('chat').getState() as {
    conversations: Record<string, ChatMessage[]>
  }
  const msn = getStore('mission').getState() as {
    mission: Mission | null
    entities: MapEntity[]
    layerVisibility: MapLayerVisibility
    viewport: MapViewport
    scenarioAgentId: string | null
  }

  const flowSnap: FlowSnapshot = {
    nodes: flow.nodes,
    edges: flow.edges,
  }

  const chatSnap: ChatSnapshot = {
    conversations: chat.conversations,
  }

  try {
    localStorage.setItem(
      flowKey(missionId),
      JSON.stringify(flowSnap),
    )
  } catch {
    /* quota */
  }
  try {
    localStorage.setItem(
      chatKey(missionId),
      JSON.stringify(chatSnap),
    )
  } catch {
    /* quota */
  }

  if (msn.mission) {
    const dataSnap: MissionDataSnapshot = {
      mission: msn.mission,
      entities: msn.entities,
      layerVisibility: msn.layerVisibility,
      viewport: msn.viewport,
      scenarioAgentId: msn.scenarioAgentId,
    }
    try {
      localStorage.setItem(
        missionDataKey(missionId),
        JSON.stringify(dataSnap),
      )
    } catch {
      /* quota */
    }
  }
}

// ── Load ─────────────────────────────────────────────────────────

export function loadMissionSnapshot(
  missionId: string,
): void {
  const flowSt = getStore('flow')
  const chatSt = getStore('chat')
  const msnSt = getStore('mission')

  // Load flow from localStorage
  const rawFlow = localStorage.getItem(
    flowKey(missionId),
  )
  if (rawFlow) {
    try {
      const snap: FlowSnapshot = JSON.parse(rawFlow)
      flowSt.setState({
        nodes: snap.nodes || [],
        edges: snap.edges || [],
      })
    } catch {
      /* corrupt */
    }
  } else {
    // No local snapshot — try fetching from backend
    flowSt.setState({ nodes: [], edges: [] })
    fetchFlowSnapshotFromBackend(missionId)
  }

  // Load chat
  const rawChat = localStorage.getItem(
    chatKey(missionId),
  )
  if (rawChat) {
    try {
      const snap: ChatSnapshot = JSON.parse(rawChat)
      chatSt.setState({
        conversations: snap.conversations || {},
      })
    } catch {
      /* corrupt */
    }
  } else {
    chatSt.setState({ conversations: {} })
  }

  // Load mission data
  const rawData = localStorage.getItem(
    missionDataKey(missionId),
  )
  if (rawData) {
    try {
      const snap: MissionDataSnapshot =
        JSON.parse(rawData)
      msnSt.setState({
        mission: snap.mission,
        entities: snap.entities || [],
        layerVisibility: snap.layerVisibility,
        viewport: snap.viewport,
        scenarioAgentId:
          snap.scenarioAgentId ?? null,
      })
    } catch {
      /* corrupt */
    }
  }
}

/** Fetch flow snapshot from backend and apply it (async, non-blocking). */
function fetchFlowSnapshotFromBackend(
  missionId: string,
): void {
  console.log(
    '[snapshot] Fetching flow from backend for',
    missionId,
  )
  champApi
    .getFlowSnapshot(missionId)
    .then((data) => {
      console.log(
        '[snapshot] Backend response:',
        data.status,
        data.snapshot
          ? `${data.snapshot.nodes?.length ?? 0} nodes`
          : data.message || 'no snapshot',
      )
      if (
        data.status !== 'success' ||
        !data.snapshot
      )
        return
      const { nodes, edges } = data.snapshot
      if (!nodes || nodes.length === 0) return

      const flowSt = getStore('flow')
      // Only apply if flow is still empty (user hasn't started editing)
      const current = flowSt.getState() as {
        nodes: unknown[]
      }
      if (current.nodes.length > 0) {
        console.log(
          '[snapshot] Flow not empty, skipping restore',
        )
        return
      }

      console.log(
        '[snapshot] Restoring',
        nodes.length,
        'nodes from backend',
      )
      flowSt.setState({
        nodes: nodes as unknown as AppNode[],
        edges: edges as unknown as Edge[],
      })

      // Cache locally so next load is instant
      try {
        localStorage.setItem(
          flowKey(missionId),
          JSON.stringify({ nodes, edges }),
        )
      } catch {
        /* quota */
      }
    })
    .catch((err) => {
      console.warn(
        '[snapshot] Failed to fetch flow from backend:',
        err,
      )
    })
}

// ── Delete ───────────────────────────────────────────────────────

export function deleteMissionSnapshot(
  missionId: string,
): void {
  localStorage.removeItem(flowKey(missionId))
  localStorage.removeItem(chatKey(missionId))
  localStorage.removeItem(missionDataKey(missionId))
}
