'use client'

import { cn } from '@/lib/utils'
import {
  useMissionStore,
  type MissionPhase,
} from '@/store/missionStore'

const PHASES: {
  key: MissionPhase
  label: string
  step: number
}[] = [
  { key: 'pre-mission', label: 'PRE-MISSION', step: 1 },
  { key: 'planning', label: 'PLANNING', step: 2 },
  { key: 'execution', label: 'EXECUTION', step: 3 },
  { key: 'review', label: 'REVIEW', step: 4 },
]

export function MissionTimeline() {
  const mission = useMissionStore((s) => s.mission)
  const setMissionPhase = useMissionStore(
    (s) => s.setMissionPhase,
  )

  if (!mission) return null

  const currentStep =
    PHASES.find((p) => p.key === mission.phase)
      ?.step || 1

  return (
    <div className="px-6 py-3 border-b border-hud-border bg-hud-surface">
      <div className="flex items-center gap-2">
        {PHASES.map((phase, idx) => {
          const isActive = mission.phase === phase.key
          const isPast = phase.step < currentStep
          return (
            <div
              key={phase.key}
              className="flex items-center gap-2"
            >
              <button
                onClick={() =>
                  setMissionPhase(phase.key)
                }
                className={cn(
                  'flex items-center gap-2 px-3 py-1 transition-all',
                  isActive
                    ? 'bg-hud-accent/10 text-hud-accent'
                    : isPast
                      ? 'text-hud-accent/50'
                      : 'text-hud-text-dim hover:text-hud-text',
                )}
              >
                <span
                  className={cn(
                    'w-5 h-5 flex items-center justify-center text-[10px] font-bold border',
                    isActive
                      ? 'border-hud-accent bg-hud-accent text-hud-bg'
                      : isPast
                        ? 'border-hud-accent/40 text-hud-accent/50'
                        : 'border-hud-border text-hud-text-dim',
                  )}
                  style={{
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {phase.step}
                </span>
                <span
                  className="text-[11px] font-medium tracking-wider uppercase"
                  style={{
                    fontFamily:
                      'var(--font-display)',
                  }}
                >
                  {phase.label}
                </span>
              </button>
              {idx < PHASES.length - 1 && (
                <div
                  className={cn(
                    'w-8 h-px',
                    phase.step < currentStep
                      ? 'bg-hud-accent/40'
                      : 'bg-hud-border',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
