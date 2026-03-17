'use client'

import {
  Users,
  Route,
  Square,
  AlertTriangle,
  Target,
  Trash2,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMissionStore,
  type MapLayerVisibility,
  type MapEntity,
} from '@/store/missionStore'

const LAYER_TOGGLES: {
  key: keyof MapLayerVisibility
  label: string
  icon: typeof Users
  tagClass: string
}[] = [
  {
    key: 'units',
    label: 'UNITS',
    icon: Users,
    tagClass: 'tag-blue',
  },
  {
    key: 'routes',
    label: 'ROUTES',
    icon: Route,
    tagClass: 'tag-accent',
  },
  {
    key: 'zones',
    label: 'ZONES',
    icon: Square,
    tagClass: 'tag-purple',
  },
  {
    key: 'threats',
    label: 'THREATS',
    icon: AlertTriangle,
    tagClass: 'tag-warning',
  },
  {
    key: 'objectives',
    label: 'OBJ',
    icon: Target,
    tagClass: 'tag-accent',
  },
]

// ── Sample scenario: Operation Thunderstrike ─────────────────

type DemoEntity = Omit<MapEntity, 'id' | 'timestamp'>

const DEMO_ENTITIES: DemoEntity[] = [
  // ── Area of Operations ─────────────────────
  {
    type: 'zone',
    name: 'AO THUNDER',
    affiliation: 'friendly',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [36.24, 34.14],
          [36.46, 34.14],
          [36.46, 34.02],
          [36.24, 34.02],
          [36.24, 34.14],
        ],
      ],
    },
    properties: { zoneType: 'ao' },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // Phase Line ALPHA
  {
    type: 'zone',
    name: 'PL ALPHA',
    affiliation: 'friendly',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [36.30, 34.085],
          [36.42, 34.085],
          [36.42, 34.08],
          [36.30, 34.08],
          [36.30, 34.085],
        ],
      ],
    },
    properties: { zoneType: 'phase_line' },
    visible: true,
    color: '#00e5a0',
    createdBy: 'agent',
  },
  // Enemy engagement area
  {
    type: 'zone',
    name: 'EA VIPER',
    affiliation: 'hostile',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [36.34, 34.12],
          [36.40, 34.12],
          [36.40, 34.095],
          [36.34, 34.095],
          [36.34, 34.12],
        ],
      ],
    },
    properties: { zoneType: 'engagement_area' },
    visible: true,
    color: '#ff6b3d',
    createdBy: 'agent',
  },

  // ── Friendly units ────────────────────────
  // Company HQ
  {
    type: 'unit',
    name: 'B CO HQ',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.28, 34.04],
    },
    properties: {
      unitType: 'hq',
      echelon: 'company',
      designation: 'B CO, 2-87 IN',
      strength: 95,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // 1st Platoon (main effort)
  {
    type: 'unit',
    name: '1st PLT',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.30, 34.055],
    },
    properties: {
      unitType: 'infantry',
      echelon: 'platoon',
      designation: '1st PLT (Main Effort)',
      strength: 90,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // 2nd Platoon (supporting effort)
  {
    type: 'unit',
    name: '2nd PLT',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.26, 34.05],
    },
    properties: {
      unitType: 'infantry',
      echelon: 'platoon',
      designation: '2nd PLT (Support)',
      strength: 85,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // 3rd Platoon (reserve)
  {
    type: 'unit',
    name: '3rd PLT',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.28, 34.03],
    },
    properties: {
      unitType: 'infantry',
      echelon: 'platoon',
      designation: '3rd PLT (Reserve)',
      strength: 100,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // Mortar section
  {
    type: 'unit',
    name: 'MTR SEC',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.275, 34.045],
    },
    properties: {
      unitType: 'artillery',
      echelon: 'squad',
      designation: '60mm MTR SEC',
      strength: 100,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // Recon team
  {
    type: 'unit',
    name: 'RCN TM',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.33, 34.075],
    },
    properties: {
      unitType: 'recon',
      echelon: 'team',
      designation: 'RCN TM SHADOW',
      strength: 100,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },

  // ── Enemy units ───────────────────────────
  // Enemy mechanized platoon
  {
    type: 'unit',
    name: 'ENY MECH PLT',
    affiliation: 'hostile',
    geometry: {
      type: 'Point',
      coordinates: [36.37, 34.105],
    },
    properties: {
      unitType: 'armor',
      echelon: 'platoon',
      designation: 'ENY MECH PLT (3x BMP)',
      strength: 80,
    },
    visible: true,
    color: '#ff6b3d',
    createdBy: 'agent',
  },
  // Enemy infantry squad (OP)
  {
    type: 'unit',
    name: 'ENY OP NORTH',
    affiliation: 'hostile',
    geometry: {
      type: 'Point',
      coordinates: [36.35, 34.115],
    },
    properties: {
      unitType: 'infantry',
      echelon: 'squad',
      designation: 'ENY OP (N)',
      strength: 70,
    },
    visible: true,
    color: '#ff6b3d',
    createdBy: 'agent',
  },
  // Enemy infantry squad (south)
  {
    type: 'unit',
    name: 'ENY SQD SOUTH',
    affiliation: 'hostile',
    geometry: {
      type: 'Point',
      coordinates: [36.38, 34.09],
    },
    properties: {
      unitType: 'infantry',
      echelon: 'squad',
      designation: 'ENY SQD (S)',
      strength: 75,
    },
    visible: true,
    color: '#ff6b3d',
    createdBy: 'agent',
  },
  // Unknown unit east
  {
    type: 'unit',
    name: 'UNK CONTACT E',
    affiliation: 'unknown',
    geometry: {
      type: 'Point',
      coordinates: [36.44, 34.08],
    },
    properties: {
      unitType: 'infantry',
      echelon: 'squad',
      designation: 'UNK — possible OP',
      strength: 50,
    },
    visible: true,
    color: '#a855f7',
    createdBy: 'agent',
  },

  // ── Objectives ────────────────────────────
  {
    type: 'objective',
    name: 'OBJ EAGLE',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.37, 34.10],
    },
    properties: {
      objectiveType: 'seize',
      priority: 'primary',
      description: 'Seize crossroads and deny enemy resupply',
    },
    visible: true,
    color: '#00e5a0',
    createdBy: 'agent',
  },
  {
    type: 'objective',
    name: 'OBJ HAWK',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.41, 34.11],
    },
    properties: {
      objectiveType: 'secure',
      priority: 'secondary',
      description: 'Secure hilltop for overwatch',
    },
    visible: true,
    color: '#00e5a0',
    createdBy: 'agent',
  },
  {
    type: 'objective',
    name: 'RP FALCON',
    affiliation: 'friendly',
    geometry: {
      type: 'Point',
      coordinates: [36.29, 34.06],
    },
    properties: {
      objectiveType: 'rally',
      priority: 'tertiary',
      description: 'Rally point for consolidation',
    },
    visible: true,
    color: '#00e5a0',
    createdBy: 'agent',
  },

  // ── Routes ────────────────────────────────
  // Main axis of advance (1st PLT)
  {
    type: 'route',
    name: 'AXIS ARROW',
    affiliation: 'friendly',
    geometry: {
      type: 'LineString',
      coordinates: [
        [36.30, 34.055],
        [36.31, 34.065],
        [36.325, 34.075],
        [36.34, 34.085],
        [36.355, 34.092],
        [36.37, 34.10],
      ],
    },
    properties: {
      routeType: 'advance',
      assignedUnit: '1st PLT',
      estimatedTime: 90,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // Supporting route (2nd PLT flanking)
  {
    type: 'route',
    name: 'ROUTE SABER',
    affiliation: 'friendly',
    geometry: {
      type: 'LineString',
      coordinates: [
        [36.26, 34.05],
        [36.265, 34.06],
        [36.28, 34.075],
        [36.30, 34.09],
        [36.32, 34.10],
        [36.34, 34.105],
        [36.37, 34.10],
      ],
    },
    properties: {
      routeType: 'maneuver',
      assignedUnit: '2nd PLT',
      estimatedTime: 120,
    },
    visible: true,
    color: '#4d8eff',
    createdBy: 'agent',
  },
  // Patrol route (recon)
  {
    type: 'route',
    name: 'PATROL GHOST',
    affiliation: 'friendly',
    geometry: {
      type: 'LineString',
      coordinates: [
        [36.33, 34.075],
        [36.35, 34.08],
        [36.37, 34.085],
        [36.39, 34.09],
        [36.41, 34.10],
        [36.41, 34.11],
      ],
    },
    properties: {
      routeType: 'patrol',
      assignedUnit: 'RCN TM',
      estimatedTime: 60,
    },
    visible: true,
    color: '#8890a4',
    createdBy: 'agent',
  },
  // Supply route
  {
    type: 'route',
    name: 'MSR COPPER',
    affiliation: 'friendly',
    geometry: {
      type: 'LineString',
      coordinates: [
        [36.25, 34.03],
        [36.27, 34.035],
        [36.28, 34.04],
        [36.29, 34.06],
      ],
    },
    properties: {
      routeType: 'supply',
      estimatedTime: 30,
    },
    visible: true,
    color: '#a855f7',
    createdBy: 'agent',
  },
  // Withdrawal route
  {
    type: 'route',
    name: 'ROUTE EXODUS',
    affiliation: 'friendly',
    geometry: {
      type: 'LineString',
      coordinates: [
        [36.37, 34.10],
        [36.35, 34.09],
        [36.33, 34.08],
        [36.31, 34.07],
        [36.29, 34.06],
      ],
    },
    properties: {
      routeType: 'withdrawal',
      estimatedTime: 45,
    },
    visible: true,
    color: '#ff6b3d',
    createdBy: 'agent',
  },

  // ── Threats ───────────────────────────────
  // IED belt
  {
    type: 'threat',
    name: 'IED BELT',
    affiliation: 'hostile',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [36.335, 34.088],
          [36.36, 34.088],
          [36.36, 34.083],
          [36.335, 34.083],
          [36.335, 34.088],
        ],
      ],
    },
    properties: {
      threatType: 'ied',
      threatLevel: 'high',
    },
    visible: true,
    color: '#ff4444',
    createdBy: 'agent',
  },
  // Sniper position
  {
    type: 'threat',
    name: 'SNIPER POS',
    affiliation: 'hostile',
    geometry: {
      type: 'Point',
      coordinates: [36.36, 34.112],
    },
    properties: {
      threatType: 'sniper',
      threatLevel: 'medium',
      radius: 400,
    },
    visible: true,
    color: '#ff6b3d',
    createdBy: 'agent',
  },
  // Mortar position
  {
    type: 'threat',
    name: 'ENY MTR POS',
    affiliation: 'hostile',
    geometry: {
      type: 'Point',
      coordinates: [36.39, 34.115],
    },
    properties: {
      threatType: 'mortar',
      threatLevel: 'high',
      radius: 800,
    },
    visible: true,
    color: '#ff4444',
    createdBy: 'agent',
  },
  // Mines
  {
    type: 'threat',
    name: 'MINEFIELD',
    affiliation: 'hostile',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [36.38, 34.095],
          [36.405, 34.095],
          [36.405, 34.085],
          [36.38, 34.085],
          [36.38, 34.095],
        ],
      ],
    },
    properties: {
      threatType: 'mines',
      threatLevel: 'critical',
    },
    visible: true,
    color: '#ff0040',
    createdBy: 'agent',
  },
  // AA position
  {
    type: 'threat',
    name: 'ENY AA',
    affiliation: 'hostile',
    geometry: {
      type: 'Point',
      coordinates: [36.42, 34.105],
    },
    properties: {
      threatType: 'aa',
      threatLevel: 'medium',
      radius: 1200,
    },
    visible: true,
    color: '#ff6b3d',
    createdBy: 'agent',
  },
]

const DEMO_VIEWPORT = {
  longitude: 36.35,
  latitude: 34.075,
  zoom: 12.5,
  bearing: 0,
  pitch: 0,
}

function loadDemoScenario() {
  const store = useMissionStore.getState()
  store.clearEntities()
  store.addEntities(DEMO_ENTITIES)
  store.setViewport(DEMO_VIEWPORT)
  if (!store.mission) {
    store.createMission(
      'OP THUNDERSTRIKE',
      'B CO, 2-87 IN seizes crossroads at OBJ EAGLE to deny enemy resupply. 1st PLT main effort along AXIS ARROW, 2nd PLT flanking via ROUTE SABER. RCN TM SHADOW screens east flank. Threats include IED belt, sniper, mortar, and minefield in EA VIPER.',
    )
    store.setMissionPhase('planning')
  }
}

// ── Component ───────────────────────────────────────────────

export function MapToolbar() {
  const layerVisibility = useMissionStore(
    (s) => s.layerVisibility,
  )
  const toggleLayer = useMissionStore(
    (s) => s.toggleLayer,
  )
  const clearEntities = useMissionStore(
    (s) => s.clearEntities,
  )
  const entityCount = useMissionStore(
    (s) => s.entities.length,
  )

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-hud-surface border-b border-hud-border">
      <span className="label mr-1 mb-0">
        LAYERS
      </span>
      {LAYER_TOGGLES.map((layer) => {
        const Icon = layer.icon
        const active = layerVisibility[layer.key]
        return (
          <button
            key={layer.key}
            onClick={() => toggleLayer(layer.key)}
            className={cn(
              'tag cursor-pointer transition-opacity',
              active
                ? layer.tagClass
                : 'text-hud-text-dim bg-transparent border-hud-border opacity-40',
            )}
            title={`Toggle ${layer.label.toLowerCase()}`}
          >
            <Icon className="w-3 h-3 mr-1" />
            {layer.label}
          </button>
        )
      })}

      <div className="flex-1" />

      <button
        onClick={loadDemoScenario}
        className="btn-ghost flex items-center gap-1 text-[10px]"
        title="Load sample scenario: OP THUNDERSTRIKE"
      >
        <Download className="w-3 h-3" />
        LOAD DEMO
      </button>

      {entityCount > 0 && (
        <button
          onClick={clearEntities}
          className="btn-ghost flex items-center gap-1 text-[10px]"
          title="Clear all entities"
        >
          <Trash2 className="w-3 h-3" />
          CLEAR
        </button>
      )}
    </div>
  )
}
