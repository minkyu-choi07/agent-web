'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ChevronDown,
  Plus,
  Trash2,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMissionStore } from '@/store/missionStore'

export function MissionPicker() {
  const missions = useMissionStore((s) => s.missions)
  const activeMissionId = useMissionStore(
    (s) => s.activeMissionId,
  )
  const mission = useMissionStore((s) => s.mission)
  const switchMission = useMissionStore(
    (s) => s.switchMission,
  )
  const deleteMission = useMissionStore(
    (s) => s.deleteMission,
  )
  const createMission = useMissionStore(
    (s) => s.createMission,
  )

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () =>
      document.removeEventListener(
        'mousedown',
        handleClick,
      )
  }, [open])

  // Focus name input when entering create mode
  useEffect(() => {
    if (creating) {
      nameInputRef.current?.focus()
    }
  }, [creating])

  const handleCreate = () => {
    if (!newName.trim()) return
    createMission(newName.trim(), newDesc.trim())
    setNewName('')
    setNewDesc('')
    setCreating(false)
    setOpen(false)
  }

  const handleSwitch = (id: string) => {
    switchMission(id)
    setOpen(false)
    setCreating(false)
  }

  const handleDelete = (
    e: React.MouseEvent,
    id: string,
  ) => {
    e.stopPropagation()
    deleteMission(id)
  }

  const PHASE_COLORS: Record<string, string> = {
    'pre-mission': 'text-hud-text-dim',
    planning: 'text-[var(--clr-blue)]',
    execution: 'text-[var(--clr-accent)]',
    review: 'text-[var(--clr-purple)]',
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => {
          setOpen((o) => !o)
          if (open) setCreating(false)
        }}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 text-[11px] tracking-wider uppercase transition-all',
          'hover:bg-hud-surface-2 border border-transparent',
          open && 'bg-hud-surface-2 border-hud-border',
          mission
            ? 'text-hud-text'
            : 'text-hud-text-dim',
        )}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <Target className="w-3 h-3 text-hud-accent" />
        <span className="max-w-[120px] truncate">
          {mission?.name || 'NO MISSION'}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-hud-text-dim transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[240px] panel border border-hud-border bg-hud-surface shadow-lg">
          {/* Mission list */}
          {!creating && missions.length > 0 && (
            <div className="max-h-[240px] overflow-y-auto no-scrollbar">
              {missions.map((m) => {
                const isActive =
                  m.id === activeMissionId
                return (
                  <button
                    key={m.id}
                    onClick={() =>
                      handleSwitch(m.id)
                    }
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left transition-all group',
                      isActive
                        ? 'bg-hud-accent/8 border-l-2 border-hud-accent'
                        : 'border-l-2 border-transparent hover:bg-hud-surface-2',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          'text-[11px] font-medium tracking-wider uppercase truncate',
                          isActive
                            ? 'text-hud-accent'
                            : 'text-hud-text',
                        )}
                        style={{
                          fontFamily:
                            'var(--font-display)',
                        }}
                      >
                        {m.name}
                      </div>
                      <div
                        className={cn(
                          'text-[9px] uppercase tracking-widest mt-0.5',
                          PHASE_COLORS[m.phase] ||
                            'text-hud-text-dim',
                        )}
                        style={{
                          fontFamily:
                            'var(--font-mono)',
                        }}
                      >
                        {m.phase}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) =>
                        handleDelete(e, m.id)
                      }
                      className="opacity-0 group-hover:opacity-100 p-1 text-hud-text-dim hover:text-[var(--clr-warning)] transition-all"
                      title="Delete mission"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!creating && missions.length === 0 && (
            <div
              className="px-3 py-4 text-center text-[10px] text-hud-text-dim tracking-wider"
              style={{
                fontFamily: 'var(--font-display)',
              }}
            >
              NO MISSIONS YET
            </div>
          )}

          {/* Inline create form */}
          {creating && (
            <div className="p-3 space-y-2">
              <span
                className="text-[10px] font-medium text-hud-text-dim tracking-widest uppercase"
                style={{
                  fontFamily: 'var(--font-display)',
                }}
              >
                NEW MISSION
              </span>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Mission name"
                value={newName}
                onChange={(e) =>
                  setNewName(e.target.value)
                }
                className="input-field w-full"
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    handleCreate()
                  if (e.key === 'Escape') {
                    setCreating(false)
                    setNewName('')
                    setNewDesc('')
                  }
                }}
              />
              <textarea
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) =>
                  setNewDesc(e.target.value)
                }
                className="input-field w-full resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setCreating(false)
                    setNewName('')
                    setNewDesc('')
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCreating(false)
                    setNewName('')
                    setNewDesc('')
                  }}
                  className="btn-ghost flex-1 justify-center text-[10px]"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className={cn(
                    'btn-primary flex-1 justify-center text-[10px]',
                    !newName.trim() &&
                      'opacity-40 cursor-not-allowed',
                  )}
                >
                  CREATE
                </button>
              </div>
            </div>
          )}

          {/* New mission button */}
          {!creating && (
            <div className="border-t border-hud-border">
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-hud-accent hover:bg-hud-accent/8 transition-all"
                style={{
                  fontFamily: 'var(--font-display)',
                }}
              >
                <Plus className="w-3 h-3" />
                <span className="tracking-wider uppercase">
                  New Mission
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
