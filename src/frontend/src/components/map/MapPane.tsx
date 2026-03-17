'use client'

import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  useMissionStore,
  type MapEntityType,
  type ForceAffiliation,
} from '@/store/missionStore'
import {
  streamChat,
  champApi,
  type SSEEvent,
} from '@/lib/champApi'
import { useFlowStore } from '@/store/flowStore'
import { MapToolbar } from './MapToolbar'
import { TacticalMap } from './TacticalMap'
import { MapControls } from './MapControls'
import { EntityList } from './EntityList'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────────

type RawEntity = {
  type?: string
  name?: string
  affiliation?: string
  geometry?: GeoJSON.Geometry
  properties?: Record<string, unknown>
  color?: string
  visible?: boolean
  // GeoJSON Feature compat
  id?: string
}

// ── Viewport fitting ────────────────────────────────────────

function fitViewportToEntities(
  entities: RawEntity[],
) {
  const points: [number, number][] = []
  for (const e of entities) {
    const g = e.geometry
    if (!g) continue
    if (g.type === 'Point') {
      points.push(
        g.coordinates as [number, number],
      )
    } else if (g.type === 'LineString') {
      for (const c of g.coordinates as [
        number,
        number,
      ][]) {
        points.push(c)
      }
    } else if (g.type === 'Polygon') {
      for (const c of (
        g.coordinates as [number, number][][]
      )[0]) {
        points.push(c)
      }
    }
  }
  if (points.length > 0) {
    const lngs = points.map((p) => p[0])
    const lats = points.map((p) => p[1])
    const lngSpan =
      Math.max(...lngs) - Math.min(...lngs)
    const latSpan =
      Math.max(...lats) - Math.min(...lats)
    const span = Math.max(lngSpan, latSpan)
    const zoom =
      span > 1
        ? 8
        : span > 0.3
          ? 10
          : span > 0.1
            ? 12
            : 13
    useMissionStore.getState().setViewport({
      longitude:
        (Math.min(...lngs) + Math.max(...lngs)) /
        2,
      latitude:
        (Math.min(...lats) + Math.max(...lats)) /
        2,
      zoom,
      bearing: 0,
      pitch: 0,
    })
  }
}

// ── Smart JSON scanner ──────────────────────────────────────
// Recursively scan any JSON structure for arrays of objects
// that look like they have geometry (GeoJSON-like). Handles:
// - Our format: { entities: [...] }
// - GeoJSON FeatureCollection: { features: [...] }
// - Plain arrays: [{ type, geometry, ... }]
// - Nested objects: { data: { items: [...] } }

function looksLikeEntity(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  // Has geometry with type + coordinates
  if (
    o.geometry &&
    typeof o.geometry === 'object'
  ) {
    const g = o.geometry as Record<string, unknown>
    if (g.type && g.coordinates) return true
  }
  // Is a GeoJSON Feature
  if (
    o.type === 'Feature' &&
    o.geometry &&
    typeof o.geometry === 'object'
  ) {
    return true
  }
  return false
}

function extractEntitiesFromAny(
  data: unknown,
  depth: number = 0,
): RawEntity[] {
  if (depth > 5) return []
  if (!data || typeof data !== 'object') return []

  // Check if data itself is an array of entities
  if (Array.isArray(data)) {
    const entities = data.filter(looksLikeEntity)
    if (entities.length > 0) {
      return entities as RawEntity[]
    }
    // Recurse into array items
    for (const item of data) {
      const found = extractEntitiesFromAny(
        item,
        depth + 1,
      )
      if (found.length > 0) return found
    }
    return []
  }

  const obj = data as Record<string, unknown>

  // Check known keys first
  for (const key of [
    'entities',
    'features',
    'items',
    'data',
    'units',
    'markers',
    'overlays',
    'elements',
    'objects',
    'layers',
  ]) {
    if (obj[key]) {
      const found = extractEntitiesFromAny(
        obj[key],
        depth + 1,
      )
      if (found.length > 0) return found
    }
  }

  // Recurse into all values
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = extractEntitiesFromAny(
        val,
        depth + 1,
      )
      if (found.length > 0) return found
    }
  }

  return []
}

function normalizeEntity(raw: RawEntity): {
  type: MapEntityType
  name: string
  affiliation: ForceAffiliation
  geometry: GeoJSON.Geometry
  properties: Record<string, unknown>
  visible: boolean
  color: string
  createdBy: 'agent'
} | null {
  if (!raw.geometry) return null
  const g = raw.geometry as unknown as Record<
    string,
    unknown
  >
  if (!g.type || !g.coordinates) return null

  // Extract name from various fields
  const props =
    (raw.properties as Record<string, unknown>) ||
    {}
  const name =
    raw.name ||
    (props.name as string) ||
    (props.designation as string) ||
    (props.title as string) ||
    (props.label as string) ||
    raw.id ||
    'Unnamed'

  // Infer entity type
  const rawType = (
    raw.type ||
    (props.entityType as string) ||
    ''
  ).toLowerCase()
  let type: MapEntityType = 'unit'
  if (
    rawType === 'feature' ||
    rawType === '' ||
    rawType === 'unit'
  ) {
    // Infer from geometry
    if (g.type === 'LineString') type = 'route'
    else if (g.type === 'Polygon') type = 'zone'
    else type = 'unit'
  } else if (
    [
      'unit',
      'objective',
      'route',
      'zone',
      'threat',
      'waypoint',
    ].includes(rawType)
  ) {
    type = rawType as MapEntityType
  } else if (
    rawType.includes('route') ||
    rawType.includes('path') ||
    rawType.includes('line')
  ) {
    type = 'route'
  } else if (
    rawType.includes('zone') ||
    rawType.includes('area') ||
    rawType.includes('polygon') ||
    rawType.includes('region')
  ) {
    type = 'zone'
  } else if (
    rawType.includes('threat') ||
    rawType.includes('enemy') ||
    rawType.includes('hazard')
  ) {
    type = 'threat'
  } else if (
    rawType.includes('objective') ||
    rawType.includes('target') ||
    rawType.includes('obj')
  ) {
    type = 'objective'
  }

  // Infer affiliation
  const rawAff = (
    raw.affiliation ||
    (props.affiliation as string) ||
    (props.side as string) ||
    (props.force as string) ||
    ''
  ).toLowerCase()
  let affiliation: ForceAffiliation = 'unknown'
  if (
    rawAff.includes('friend') ||
    rawAff.includes('blue') ||
    rawAff.includes('own')
  ) {
    affiliation = 'friendly'
  } else if (
    rawAff.includes('hostile') ||
    rawAff.includes('enemy') ||
    rawAff.includes('red') ||
    rawAff.includes('opfor')
  ) {
    affiliation = 'hostile'
  } else if (
    rawAff.includes('neutral') ||
    rawAff.includes('civilian') ||
    rawAff.includes('green')
  ) {
    affiliation = 'neutral'
  }

  return {
    type,
    name,
    affiliation,
    geometry: raw.geometry,
    properties: props,
    visible: raw.visible !== false,
    color: raw.color || '',
    createdBy: 'agent',
  }
}

// ── Extract mission metadata ────────────────────────────────

function extractMissionMeta(data: unknown): {
  name?: string
  description?: string
} | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  // Direct mission field
  if (
    obj.mission &&
    typeof obj.mission === 'object'
  ) {
    const m = obj.mission as Record<string, unknown>
    return {
      name: (m.name as string) || undefined,
      description:
        (m.description as string) || undefined,
    }
  }

  // Top-level name/description
  if (obj.name && typeof obj.name === 'string') {
    return {
      name: obj.name as string,
      description:
        (obj.description as string) || undefined,
    }
  }

  return null
}

// ── Direct load (client-side smart parse) ───────────────────

function loadFromJSON(raw: string): boolean {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return false
  }

  const rawEntities = extractEntitiesFromAny(data)
  console.log(
    '[MapPane] Smart scanner found',
    rawEntities.length,
    'entities',
  )
  if (rawEntities.length === 0) return false

  const normalized = rawEntities
    .map(normalizeEntity)
    .filter(
      (e): e is NonNullable<typeof e> => e !== null,
    )
  if (normalized.length === 0) return false

  const store = useMissionStore.getState()

  // Load mission metadata
  const meta = extractMissionMeta(data)
  if (meta?.name) {
    if (!store.mission) {
      store.createMission(
        meta.name,
        meta.description || '',
      )
      store.setMissionPhase('planning')
    } else {
      store.updateMission({
        name: meta.name,
        description: meta.description || '',
      })
    }
  }

  store.clearEntities()
  store.addEntities(normalized)
  fitViewportToEntities(rawEntities)

  toast.success(
    `Loaded ${normalized.length} entities${meta?.name ? ` — ${meta.name}` : ''}`,
  )
  return true
}

// ── Agent-based parsing (ephemeral agent) ───────────────────

const SCENARIO_AGENT_ID = '__scenario_parser__'

async function sendToAgentForParsing(
  content: string,
  fileName: string,
) {
  const host = useFlowStore.getState().champHost
  if (!host) {
    toast.error(
      'Champ host not configured. Set it in Settings first.',
      { duration: 4000 },
    )
    return
  }

  const toastId = toast.loading(
    'Deploying scenario parser agent...',
  )

  try {
    // Ensure LLM is configured on the backend
    const settings =
      useFlowStore.getState().universalSettings
    if (!settings?.apiKey) {
      toast.error(
        'No API key set. Open Settings and configure your LLM provider.',
        { id: toastId, duration: 5000 },
      )
      return
    }
    try {
      await champApi.configureLlm({
        provider: settings.provider || 'openai',
        api_key: settings.apiKey,
        default_model:
          settings.defaultModel || 'gpt-4o',
      })
    } catch {
      toast.error(
        'Cannot reach backend. Is it running?',
        { id: toastId, duration: 4000 },
      )
      return
    }

    // 1. Deploy ephemeral agent with MAP_OVERLAY
    await champApi.addAgent({
      agent_id: SCENARIO_AGENT_ID,
      name: 'Scenario Parser',
      model: '',
      agent_config: {
        llm_config: {},
        reasoning_config: {},
        tool_config: {
          tools_list: ['MAP_OVERLAY'],
        },
      },
    })

    toast.loading('Agent parsing scenario...', {
      id: toastId,
    })

    // 2. Stream the parse request
    const prompt = `You are a military scenario parser. Analyze the following file and extract ALL tactical entities. You MUST call the update_map_overlay tool with the extracted entities.

For each entity, provide:
- type: "unit", "objective", "route", "zone", "threat", or "waypoint"
- name: a short tactical name
- affiliation: "friendly", "hostile", "neutral", or "unknown"
- geometry: GeoJSON geometry (Point for units/objectives/point-threats, LineString for routes, Polygon for zones/area-threats)
- properties: type-specific details (unitType, echelon, designation, routeType, zoneType, threatType, threatLevel, etc.)
- color: #4d8eff friendly, #ff6b3d hostile, #00e5a0 objectives, #a855f7 unknown, #8890a4 neutral, #ff4444 high threats, #ff0040 critical threats

Set viewport to center on the scenario area.
If coordinates are not explicit, infer realistic ones from context.

File: ${fileName}
Content:
\`\`\`
${content.slice(0, 16000)}
\`\`\``

    await new Promise<void>((resolve, reject) => {
      const controller = streamChat(
        SCENARIO_AGENT_ID,
        prompt,
        (event: SSEEvent) => {
          if (event.event === 'tool_call') {
            const tool = event.data
              .tool as string
            if (tool === 'update_map_overlay') {
              const args = event.data.args as
                | Record<string, unknown>
                | undefined
              const entities =
                args?.entities as RawEntity[]
              const viewport =
                args?.viewport as
                  | Record<string, number>
                  | undefined
              if (
                entities &&
                Array.isArray(entities)
              ) {
                const normalized = entities
                  .map(normalizeEntity)
                  .filter(
                    (
                      e,
                    ): e is NonNullable<
                      typeof e
                    > => e !== null,
                  )
                const store =
                  useMissionStore.getState()
                store.clearEntities()
                store.addEntities(normalized)
                if (normalized.length > 0) {
                  fitViewportToEntities(entities)
                }
                if (viewport) {
                  store.setViewport(viewport)
                }
              }
            }
          } else if (event.event === 'done') {
            resolve()
          } else if (event.event === 'error') {
            reject(
              new Error(
                (event.data
                  .message as string) ||
                  'Agent error',
              ),
            )
          }
        },
        (error: Error) => reject(error),
        () => resolve(),
      )

      setTimeout(() => {
        controller.abort()
        resolve()
      }, 60000)
    })

    const entityCount =
      useMissionStore.getState().entities.length
    if (entityCount > 0) {
      toast.success(
        `Parsed ${entityCount} entities from ${fileName}`,
        { id: toastId },
      )
    } else {
      toast.error(
        'Agent could not extract entities from this file',
        { id: toastId },
      )
    }
  } catch (err) {
    toast.error(
      `Parse failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      { id: toastId },
    )
  } finally {
    // 3. Tear down ephemeral agent
    try {
      await champApi.decommissionAgent(
        SCENARIO_AGENT_ID,
      )
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ── File handler (smart parse → agent fallback) ─────────────

function handleFileContent(
  content: string,
  fileName: string,
) {
  // 1. Try smart client-side JSON parsing
  if (loadFromJSON(content)) return

  // 2. Fall back to agent-based parsing
  toast(
    'Could not auto-detect entities — sending to agent',
    { icon: '\u{1F504}', duration: 3000 },
  )
  sendToAgentForParsing(content, fileName)
}

// ── Component ───────────────────────────────────────────────

export function MapPane() {
  const [dragOver, setDragOver] = useState(false)
  const dragCountRef = useRef(0)

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCountRef.current++
      if (
        dragCountRef.current === 1 &&
        e.dataTransfer.types.includes('Files')
      ) {
        setDragOver(true)
      }
    },
    [],
  )

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    },
    [],
  )

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCountRef.current--
      if (dragCountRef.current === 0) {
        setDragOver(false)
      }
    },
    [],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCountRef.current = 0
      setDragOver(false)

      const file = e.dataTransfer.files[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        if (text) {
          handleFileContent(text, file.name)
        }
      }
      reader.readAsText(file)
    },
    [],
  )

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <MapToolbar />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <TacticalMap />
          <MapControls />
        </div>
        <EntityList />
      </div>

      {/* Drop overlay */}
      {dragOver && (
        <div
          className={cn(
            'absolute inset-0 z-50 flex items-center justify-center',
            'border-2 border-dashed border-hud-accent',
          )}
          style={{
            background: 'rgba(10, 12, 16, 0.85)',
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={onDrop}
        >
          <div className="text-center pointer-events-none">
            <p
              className="text-sm font-bold tracking-widest uppercase mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--clr-accent)',
              }}
            >
              DROP SCENARIO FILE
            </p>
            <p
              className="text-[11px] leading-relaxed"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--clr-text-dim)',
              }}
            >
              JSON / GeoJSON / text
              {' \u2192 '}
              auto-detected
              <br />
              unknown format
              {' \u2192 '}
              parsed by agent
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
