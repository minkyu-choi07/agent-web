'use client'

import {
  Users,
  Route,
  Square,
  AlertTriangle,
  Target,
  MapPin,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMissionStore,
  AFFILIATION_COLORS,
  ENTITY_TYPE_COLORS,
  type MapEntityType,
} from '@/store/missionStore'

const TYPE_ICONS: Record<
  MapEntityType,
  typeof Users
> = {
  unit: Users,
  route: Route,
  zone: Square,
  threat: AlertTriangle,
  objective: Target,
  waypoint: MapPin,
}

const TYPE_LABELS: Record<MapEntityType, string> = {
  unit: 'UNITS',
  route: 'ROUTES',
  zone: 'ZONES',
  threat: 'THREATS',
  objective: 'OBJECTIVES',
  waypoint: 'WAYPOINTS',
}

export function EntityList() {
  const entities = useMissionStore((s) => s.entities)
  const selectedEntityId = useMissionStore(
    (s) => s.selectedEntityId,
  )
  const selectEntity = useMissionStore(
    (s) => s.selectEntity,
  )
  const removeEntity = useMissionStore(
    (s) => s.removeEntity,
  )

  // Group entities by type
  const grouped = entities.reduce(
    (acc, entity) => {
      if (!acc[entity.type]) acc[entity.type] = []
      acc[entity.type].push(entity)
      return acc
    },
    {} as Record<
      string,
      (typeof entities)[number][]
    >,
  )

  if (entities.length === 0) {
    return (
      <div className="w-56 panel border-l border-hud-border flex flex-col">
        <div className="px-3 py-2 border-b border-hud-border">
          <span className="label mb-0">
            ENTITIES
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p
            className="text-[11px] text-hud-text-dim text-center leading-relaxed"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            No entities placed.
            <br />
            Use the scenario agent
            <br />
            to parse & overlay.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-56 panel border-l border-hud-border flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-hud-border flex items-center justify-between">
        <span className="label mb-0">
          ENTITIES
        </span>
        <span
          className="text-[10px] text-hud-text-dim"
          style={{
            fontFamily: 'var(--font-mono)',
          }}
        >
          {entities.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {(
          Object.keys(grouped) as MapEntityType[]
        ).map((type) => {
          const Icon = TYPE_ICONS[type]
          const items = grouped[type]
          return (
            <div key={type}>
              <div className="px-3 py-1.5 flex items-center gap-1.5 bg-hud-surface-2">
                <Icon className="w-3 h-3 text-hud-text-dim" />
                <span className="label mb-0 text-[9px]">
                  {TYPE_LABELS[type]} ({items.length}
                  )
                </span>
              </div>
              {items.map((entity) => {
                const color =
                  entity.color ||
                  ENTITY_TYPE_COLORS[
                    entity.type
                  ] ||
                  AFFILIATION_COLORS[
                    entity.affiliation
                  ]
                const isSelected =
                  selectedEntityId === entity.id
                return (
                  <button
                    key={entity.id}
                    onClick={() =>
                      selectEntity(
                        isSelected
                          ? null
                          : entity.id,
                      )
                    }
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                      isSelected
                        ? 'bg-hud-accent/10 border-l-2 border-hud-accent'
                        : 'hover:bg-hud-surface-2 border-l-2 border-transparent',
                    )}
                  >
                    <span
                      className="w-2 h-2 flex-shrink-0"
                      style={{
                        backgroundColor: color,
                      }}
                    />
                    <span
                      className="text-[11px] text-hud-text truncate flex-1"
                      style={{
                        fontFamily:
                          'var(--font-mono)',
                      }}
                    >
                      {entity.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeEntity(entity.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-hud-warning transition-opacity"
                    >
                      <X className="w-3 h-3 text-hud-text-dim hover:text-hud-warning" />
                    </button>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
