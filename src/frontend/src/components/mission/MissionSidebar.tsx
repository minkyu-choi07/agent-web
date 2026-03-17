'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMissionStore,
  type MissionPhase,
} from '@/store/missionStore'

const PHASES: {
  key: MissionPhase
  label: string
}[] = [
  { key: 'pre-mission', label: 'PRE-MISSION' },
  { key: 'planning', label: 'PLANNING' },
  { key: 'execution', label: 'EXECUTION' },
  { key: 'review', label: 'REVIEW' },
]

export function MissionSidebar() {
  const mission = useMissionStore((s) => s.mission)
  const createMission = useMissionStore(
    (s) => s.createMission,
  )
  const updateMission = useMissionStore(
    (s) => s.updateMission,
  )
  const setMissionPhase = useMissionStore(
    (s) => s.setMissionPhase,
  )
  const entityCount = useMissionStore(
    (s) => s.entities.length,
  )

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const handleCreate = () => {
    if (!newName.trim()) return
    createMission(newName.trim(), newDesc.trim())
    setNewName('')
    setNewDesc('')
  }

  return (
    <div className="w-64 panel border-r border-hud-border flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-hud-border">
        <span
          className="text-xs font-bold text-hud-accent tracking-widest uppercase"
          style={{
            fontFamily: 'var(--font-display)',
          }}
        >
          MISSION
        </span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!mission ? (
          <div className="p-4 space-y-3">
            <span className="label">
              NEW MISSION
            </span>
            <input
              type="text"
              placeholder="Mission name"
              value={newName}
              onChange={(e) =>
                setNewName(e.target.value)
              }
              className="input-field"
              onKeyDown={(e) =>
                e.key === 'Enter' && handleCreate()
              }
            />
            <textarea
              placeholder="Description"
              value={newDesc}
              onChange={(e) =>
                setNewDesc(e.target.value)
              }
              className="input-field resize-none"
              rows={3}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className={cn(
                'btn-primary w-full justify-center',
                !newName.trim() &&
                  'opacity-40 cursor-not-allowed',
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              CREATE MISSION
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Mission name */}
            <div>
              <span className="label">NAME</span>
              <input
                type="text"
                value={mission.name}
                onChange={(e) =>
                  updateMission({
                    name: e.target.value,
                  })
                }
                className="input-field"
              />
            </div>

            {/* Description */}
            <div>
              <span className="label">
                DESCRIPTION
              </span>
              <textarea
                value={mission.description}
                onChange={(e) =>
                  updateMission({
                    description: e.target.value,
                  })
                }
                className="input-field resize-none"
                rows={3}
              />
            </div>

            {/* Phase selector */}
            <div>
              <span className="label">PHASE</span>
              <div className="space-y-1">
                {PHASES.map((phase) => (
                  <button
                    key={phase.key}
                    onClick={() =>
                      setMissionPhase(phase.key)
                    }
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-[11px] tracking-wider transition-all',
                      mission.phase === phase.key
                        ? 'bg-hud-accent/10 text-hud-accent border-l-2 border-hud-accent'
                        : 'text-hud-text-dim hover:text-hud-text hover:bg-hud-surface-2 border-l-2 border-transparent',
                    )}
                    style={{
                      fontFamily:
                        'var(--font-display)',
                    }}
                  >
                    {phase.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="pt-2 border-t border-hud-border">
              <div className="flex items-center justify-between">
                <span className="label mb-0">
                  MAP ENTITIES
                </span>
                <span
                  className="text-[10px] text-hud-text-dim"
                  style={{
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {entityCount}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
