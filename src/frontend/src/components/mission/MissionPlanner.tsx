'use client'

import { MissionSidebar } from './MissionSidebar'
import { MissionTimeline } from './MissionTimeline'
import { ScenarioInput } from './ScenarioInput'
import { useMissionStore } from '@/store/missionStore'

export function MissionPlanner() {
  const mission = useMissionStore((s) => s.mission)

  return (
    <div className="flex-1 flex overflow-hidden">
      <MissionSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MissionTimeline />
        <div className="flex-1 overflow-y-auto p-6">
          {!mission ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p
                  className="text-hud-text-dim text-sm mb-2"
                  style={{
                    fontFamily:
                      'var(--font-display)',
                  }}
                >
                  NO ACTIVE MISSION
                </p>
                <p
                  className="text-hud-text-dim text-[11px]"
                  style={{
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Create a mission from the sidebar
                  to begin planning.
                </p>
              </div>
            </div>
          ) : (
            <ScenarioInput />
          )}
        </div>
      </div>
    </div>
  )
}
