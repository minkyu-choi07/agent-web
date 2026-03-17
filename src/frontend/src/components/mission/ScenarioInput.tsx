'use client'

import { useState } from 'react'
import { Send, Upload, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMissionStore } from '@/store/missionStore'

export function ScenarioInput() {
  const mission = useMissionStore((s) => s.mission)
  const updateMission = useMissionStore(
    (s) => s.updateMission,
  )
  const isParsingScenario = useMissionStore(
    (s) => s.isParsingScenario,
  )
  const setActiveView = useMissionStore(
    (s) => s.setActiveView,
  )
  const entityCount = useMissionStore(
    (s) => s.entities.length,
  )

  const [localText, setLocalText] = useState(
    mission?.scenarioText || '',
  )

  const handleSave = () => {
    updateMission({ scenarioText: localText })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2
          className="text-sm font-bold text-hud-text tracking-wider uppercase mb-1"
          style={{
            fontFamily: 'var(--font-display)',
          }}
        >
          SCENARIO DESCRIPTION
        </h2>
        <p
          className="text-[11px] text-hud-text-dim leading-relaxed"
          style={{
            fontFamily: 'var(--font-mono)',
          }}
        >
          Describe the tactical scenario. Include
          unit positions, objectives, routes, threat
          areas, and area of operations. The scenario
          agent will parse this and overlay entities
          on the tactical map.
        </p>
      </div>

      {/* Scenario text area */}
      <div>
        <span className="label">
          SCENARIO TEXT
        </span>
        <textarea
          value={localText}
          onChange={(e) =>
            setLocalText(e.target.value)
          }
          onBlur={handleSave}
          placeholder={`Example:\n\nFriendly forces: 1st Platoon, B Company positioned at grid 38.9072°N, -77.0369°E.\nObjective ALPHA: Secure the bridge at 38.91°N, -77.02°E.\nRoute BRAVO: Advance along Highway 1 from current position to OBJ ALPHA.\nThreat: Enemy observation post at 38.905°N, -77.025°E (medium threat).\nArea of Operations: 5km radius around OBJ ALPHA.`}
          className="input-field resize-none"
          rows={12}
          style={{ lineHeight: '1.7' }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          disabled={
            !localText.trim() || isParsingScenario
          }
          className={cn(
            'btn-primary',
            (!localText.trim() ||
              isParsingScenario) &&
              'opacity-40 cursor-not-allowed',
          )}
          title="Parse scenario and place entities on map (requires deployed scenario agent)"
        >
          <Send className="w-3.5 h-3.5" />
          {isParsingScenario
            ? 'PARSING...'
            : 'PARSE SCENARIO'}
        </button>

        <label
          className="btn-ghost cursor-pointer"
          title="Upload scenario file"
        >
          <Upload className="w-3.5 h-3.5" />
          UPLOAD FILE
          <input
            type="file"
            className="hidden"
            accept=".txt,.md,.json,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = (ev) => {
                const text =
                  ev.target?.result as string
                setLocalText(
                  (prev) =>
                    prev +
                    (prev ? '\n\n' : '') +
                    text,
                )
              }
              reader.readAsText(file)
              e.target.value = ''
            }}
          />
        </label>

        {entityCount > 0 && (
          <button
            onClick={() => setActiveView('map')}
            className="btn-ghost"
          >
            <MapPin className="w-3.5 h-3.5" />
            VIEW MAP ({entityCount})
          </button>
        )}
      </div>

      {/* Info */}
      <div className="panel p-4">
        <span className="label">
          SCENARIO PARSING
        </span>
        <p
          className="text-[11px] text-hud-text-dim leading-relaxed"
          style={{
            fontFamily: 'var(--font-mono)',
          }}
        >
          To parse scenarios automatically, deploy an
          agent in the Flow tab with the{' '}
          <span className="tag tag-accent text-[9px]">
            MAP_OVERLAY
          </span>{' '}
          tool enabled. The agent will analyze the
          scenario text and place tactical entities
          (units, routes, zones, threats, objectives)
          on the map.
        </p>
      </div>
    </div>
  )
}
