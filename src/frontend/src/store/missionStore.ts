import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  registerStore,
  getStore,
} from '@/store/storeRegistry'
import {
  saveMissionSnapshot,
  loadMissionSnapshot,
  deleteMissionSnapshot,
} from '@/store/missionSnapshot'
import { champApi } from '@/lib/champApi'

// ── Types ────────────────────────────────────────────────────────

export type ActiveView = 'flow' | 'mission' | 'map'

export type MissionPhase =
  | 'pre-mission'
  | 'planning'
  | 'execution'
  | 'review'

export type Mission = {
  id: string
  name: string
  description: string
  phase: MissionPhase
  scenarioText: string
  createdAt: number
  updatedAt: number
}

export type MissionSummary = {
  id: string
  name: string
  phase: MissionPhase
  updatedAt: number
}

export type MapEntityType =
  | 'unit'
  | 'objective'
  | 'route'
  | 'zone'
  | 'threat'
  | 'waypoint'

export type ForceAffiliation =
  | 'friendly'
  | 'hostile'
  | 'neutral'
  | 'unknown'

export type MapEntity = {
  id: string
  type: MapEntityType
  name: string
  affiliation: ForceAffiliation
  geometry: GeoJSON.Geometry
  properties: Record<string, unknown>
  visible: boolean
  color: string
  createdBy: 'user' | 'agent'
  agentSourceId?: string
  timestamp: number
}

export type MapLayerVisibility = {
  units: boolean
  routes: boolean
  zones: boolean
  threats: boolean
  objectives: boolean
}

export type MapViewport = {
  longitude: number
  latitude: number
  zoom: number
  bearing: number
  pitch: number
}

// ── Affiliation colors ──────────────────────────────────────────

export const AFFILIATION_COLORS: Record<
  ForceAffiliation,
  string
> = {
  friendly: '#4d8eff',
  hostile: '#ff6b3d',
  neutral: '#8890a4',
  unknown: '#a855f7',
}

export const ENTITY_TYPE_COLORS: Record<string, string> =
  {
    objective: '#00e5a0',
    waypoint: '#8890a4',
  }

// ── State ───────────────────────────────────────────────────────

type MissionState = {
  activeView: ActiveView

  // Multi-mission
  missions: MissionSummary[]
  activeMissionId: string | null

  // Current mission data
  mission: Mission | null
  entities: MapEntity[]
  selectedEntityId: string | null
  layerVisibility: MapLayerVisibility
  viewport: MapViewport
  scenarioAgentId: string | null
  isParsingScenario: boolean
}

type MissionActions = {
  setActiveView: (view: ActiveView) => void

  fetchMissions: () => Promise<void>
  createMission: (
    name: string,
    description: string,
  ) => void
  updateMission: (updates: Partial<Mission>) => void
  setMissionPhase: (phase: MissionPhase) => void
  switchMission: (id: string) => void | Promise<void>
  deleteMission: (id: string) => void

  addEntity: (
    entity: Omit<MapEntity, 'id' | 'timestamp'>,
  ) => void
  addEntities: (
    entities: Omit<MapEntity, 'id' | 'timestamp'>[],
  ) => void
  updateEntity: (
    id: string,
    updates: Partial<MapEntity>,
  ) => void
  removeEntity: (id: string) => void
  selectEntity: (id: string | null) => void
  clearEntities: () => void

  toggleLayer: (
    layer: keyof MapLayerVisibility,
  ) => void
  setViewport: (
    viewport: Partial<MapViewport>,
  ) => void

  setScenarioAgentId: (id: string | null) => void
  setParsingScenario: (parsing: boolean) => void
}

// ── Helpers ─────────────────────────────────────────────────────

let entityCounter = 0
function nextEntityId() {
  return `ent-${Date.now()}-${entityCounter++}`
}

function summaryFromMission(
  m: Mission,
): MissionSummary {
  return {
    id: m.id,
    name: m.name,
    phase: m.phase,
    updatedAt: m.updatedAt,
  }
}

// Access sibling stores via registry to avoid circular deps
function flowSt() {
  return getStore('flow')
}
function chatSt() {
  return getStore('chat')
}

const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
  units: true,
  routes: true,
  zones: true,
  threats: true,
  objectives: true,
}

const DEFAULT_VIEWPORT: MapViewport = {
  longitude: -98.5795,
  latitude: 39.8283,
  zoom: 4,
  bearing: 0,
  pitch: 0,
}

const BLANK_MISSION_STATE = {
  mission: null as Mission | null,
  entities: [] as MapEntity[],
  selectedEntityId: null as string | null,
  layerVisibility: { ...DEFAULT_LAYER_VISIBILITY },
  viewport: { ...DEFAULT_VIEWPORT },
  scenarioAgentId: null as string | null,
  isParsingScenario: false,
}

// ── Store ───────────────────────────────────────────────────────

export const useMissionStore = create<
  MissionState & MissionActions
>()(
  persist(
    (set, get) => ({
      activeView: 'flow',
      missions: [],
      activeMissionId: null,
      ...BLANK_MISSION_STATE,

      setActiveView: (view) =>
        set({ activeView: view }),

      fetchMissions: async () => {
        try {
          const data = await champApi.listMissions()
          if (data.status !== 'success') return
          const remote = data.missions
          const local = get().missions
          const localIds = new Set(
            local.map((m) => m.id),
          )
          const merged = [...local]
          for (const rm of remote) {
            if (!localIds.has(rm.mission_id)) {
              merged.push({
                id: rm.mission_id,
                name: rm.name,
                phase:
                  (rm.phase as MissionPhase) ||
                  'pre-mission',
                updatedAt: new Date(
                  rm.updated_at,
                ).getTime(),
              })
            }
          }
          if (merged.length !== local.length) {
            set({ missions: merged })
          }
        } catch {
          /* network error — silent */
        }
      },

      createMission: (name, description) => {
        const { activeMissionId, missions } = get()

        // Save current mission before creating new
        if (activeMissionId) {
          saveMissionSnapshot(
            activeMissionId,
          )
        }

        const now = Date.now()
        const newMission: Mission = {
          id: `msn-${now}`,
          name,
          description,
          phase: 'pre-mission',
          scenarioText: '',
          createdAt: now,
          updatedAt: now,
        }

        // Clear sibling stores
        flowSt().setState({ nodes: [], edges: [] })
        chatSt().setState({ conversations: {} })

        set({
          mission: newMission,
          activeMissionId: newMission.id,
          missions: [
            ...missions,
            summaryFromMission(newMission),
          ],
          entities: [],
          selectedEntityId: null,
          layerVisibility: {
            ...DEFAULT_LAYER_VISIBILITY,
          },
          viewport: { ...DEFAULT_VIEWPORT },
          scenarioAgentId: null,
          isParsingScenario: false,
        })

        // Persist to backend (fire-and-forget)
        champApi
          .createMission({
            mission_id: newMission.id,
            name,
            description,
          })
          .catch(() => {})
      },

      updateMission: (updates) => {
        const { mission } = get()
        if (!mission) return
        set((s) => {
          if (!s.mission) return {}
          const updated = {
            ...s.mission,
            ...updates,
            updatedAt: Date.now(),
          }
          return {
            mission: updated,
            missions: s.missions.map((m) =>
              m.id === updated.id
                ? summaryFromMission(updated)
                : m,
            ),
          }
        })
        // Sync to backend
        champApi
          .updateMission(mission.id, {
            name: updates.name,
            description: updates.description,
            phase: updates.phase,
          })
          .catch(() => {})
      },

      setMissionPhase: (phase) => {
        const { mission } = get()
        if (!mission) return
        set((s) => {
          if (!s.mission) return {}
          const updated = {
            ...s.mission,
            phase,
            updatedAt: Date.now(),
          }
          return {
            mission: updated,
            missions: s.missions.map((m) =>
              m.id === updated.id
                ? summaryFromMission(updated)
                : m,
            ),
          }
        })
        champApi
          .updateMission(mission.id, { phase })
          .catch(() => {})
      },

      switchMission: async (id) => {
        const { activeMissionId, missions } = get()
        if (activeMissionId === id) return

        // Cancel active chat stream
        const cs = chatSt().getState() as {
          cancelStream: () => void
        }
        cs.cancelStream()

        // Save current mission
        if (activeMissionId) {
          saveMissionSnapshot(activeMissionId)
        }

        // Load target from localStorage
        loadMissionSnapshot(id)
        set({ activeMissionId: id })

        // If loadMissionSnapshot didn't populate mission
        // (no local data — new browser), build it from the summary
        const afterLoad = get()
        if (!afterLoad.mission) {
          const summary = missions.find(
            (m) => m.id === id,
          )
          if (summary) {
            set({
              mission: {
                id: summary.id,
                name: summary.name,
                description: '',
                phase: summary.phase,
                scenarioText: '',
                createdAt: summary.updatedAt,
                updatedAt: summary.updatedAt,
              },
            })
          }
          // Fetch full mission details from backend
          champApi
            .listMissions()
            .then((data) => {
              if (data.status !== 'success') return
              const remote = data.missions.find(
                (m) => m.mission_id === id,
              )
              if (!remote) return
              const current = get()
              if (current.activeMissionId !== id)
                return
              set({
                mission: {
                  id: remote.mission_id,
                  name: remote.name,
                  description: remote.description,
                  phase:
                    (remote.phase as MissionPhase) ||
                    'pre-mission',
                  scenarioText: '',
                  createdAt: new Date(
                    remote.created_at,
                  ).getTime(),
                  updatedAt: new Date(
                    remote.updated_at,
                  ).getTime(),
                },
              })
            })
            .catch(() => {})
        }

        // If no local flow snapshot, fetch from backend (awaited)
        const flowState = flowSt().getState() as {
          nodes: unknown[]
        }
        if (flowState.nodes.length === 0) {
          try {
            const data =
              await champApi.getFlowSnapshot(id)
            if (
              data.status === 'success' &&
              data.snapshot
            ) {
              const { nodes, edges } = data.snapshot
              if (nodes && nodes.length > 0) {
                flowSt().setState({
                  nodes,
                  edges: edges || [],
                })
                // Cache locally
                try {
                  localStorage.setItem(
                    `champ-msn-${id}-flow`,
                    JSON.stringify({ nodes, edges }),
                  )
                } catch {
                  /* quota */
                }
              }
            }
          } catch {
            /* network error — silent */
          }
        }
      },

      deleteMission: (id) => {
        const { activeMissionId, missions } = get()

        deleteMissionSnapshot(id)
        const remaining = missions.filter(
          (m) => m.id !== id,
        )

        if (activeMissionId === id) {
          flowSt().setState({
            nodes: [],
            edges: [],
          })
          chatSt().setState({ conversations: {} })
          set({
            missions: remaining,
            activeMissionId: null,
            ...BLANK_MISSION_STATE,
          })
        } else {
          set({ missions: remaining })
        }

        // Delete from backend
        champApi.deleteMission(id).catch(() => {})
      },

      addEntity: (entity) =>
        set((s) => ({
          entities: [
            ...s.entities,
            {
              ...entity,
              id: nextEntityId(),
              timestamp: Date.now(),
            },
          ],
        })),

      addEntities: (entities) =>
        set((s) => ({
          entities: [
            ...s.entities,
            ...entities.map((e) => ({
              ...e,
              id: nextEntityId(),
              timestamp: Date.now(),
            })),
          ],
        })),

      updateEntity: (id, updates) =>
        set((s) => ({
          entities: s.entities.map((e) =>
            e.id === id ? { ...e, ...updates } : e,
          ),
        })),

      removeEntity: (id) =>
        set((s) => ({
          entities: s.entities.filter(
            (e) => e.id !== id,
          ),
          selectedEntityId:
            s.selectedEntityId === id
              ? null
              : s.selectedEntityId,
        })),

      selectEntity: (id) =>
        set({ selectedEntityId: id }),

      clearEntities: () =>
        set({
          entities: [],
          selectedEntityId: null,
        }),

      toggleLayer: (layer) =>
        set((s) => ({
          layerVisibility: {
            ...s.layerVisibility,
            [layer]: !s.layerVisibility[layer],
          },
        })),

      setViewport: (viewport) =>
        set((s) => ({
          viewport: { ...s.viewport, ...viewport },
        })),

      setScenarioAgentId: (id) =>
        set({ scenarioAgentId: id }),

      setParsingScenario: (parsing) =>
        set({ isParsingScenario: parsing }),
    }),
    {
      name: 'champ-mission-storage',
      partialize: (state) => ({
        missions: state.missions,
        activeMissionId: state.activeMissionId,
        mission: state.mission,
        entities: state.entities,
        layerVisibility: state.layerVisibility,
        viewport: state.viewport,
      }),
    },
  ),
)

registerStore('mission', useMissionStore)
