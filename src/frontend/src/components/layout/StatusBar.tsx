'use client'

import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFlowStore } from '@/store/flowStore'
import { useDeployStore } from '@/store/deployStore'
import { useMissionStore } from '@/store/missionStore'

function StatusItem({
  ready,
  label,
  onGearClick,
}: {
  ready: boolean
  label: string
  onGearClick?: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'status-xo',
          ready ? 'status-xo-on' : 'status-xo-off',
          !ready && 'status-indicator-blink',
        )}
      >
        {ready ? 'O' : 'X'}
      </span>
      <span className="status-bar-text">{label}</span>
      {onGearClick && (
        <button
          className="status-gear"
          title={`Configure ${label.toLowerCase()}`}
          onClick={onGearClick}
        >
          <Settings className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )
}

export function StatusBar() {
  const nodeCount = useFlowStore((s) => s.nodes.length)
  const edgeCount = useFlowStore((s) => s.edges.length)
  const llmConfiguredAt = useFlowStore(
    (s) => s.llmConfiguredAt,
  )
  const champConfiguredAt = useFlowStore(
    (s) => s.champConfiguredAt,
  )
  const toggleSettingsPanel = useFlowStore(
    (s) => s.toggleSettingsPanel,
  )

  const deployStatus = useDeployStore((s) => s.status)
  const activeView = useMissionStore(
    (s) => s.activeView,
  )
  const entityCount = useMissionStore(
    (s) => s.entities.length,
  )
  const missionPhase = useMissionStore(
    (s) => s.mission?.phase,
  )

  const llmReady = !!llmConfiguredAt
  const champReady = !!champConfiguredAt
  const deployReady = deployStatus === 'deployed'

  return (
    <footer className="status-bar">
      {/* Left: system indicators */}
      <div className="flex items-center gap-3">
        <StatusItem
          ready={llmReady}
          label="LLM CLIENT"
          onGearClick={toggleSettingsPanel}
        />
        <span className="status-bar-sep" />
        <StatusItem
          ready={champReady}
          label="CHAMP"
          onGearClick={toggleSettingsPanel}
        />
        <span className="status-bar-sep" />
        <StatusItem
          ready={deployReady}
          label="DEPLOY"
        />
      </div>

      {/* Right: view-specific stats */}
      <div className="flex items-center gap-3">
        {activeView === 'flow' && (
          <>
            <span className="status-bar-text">
              {nodeCount} node
              {nodeCount !== 1 ? 's' : ''}
            </span>
            <span className="status-bar-sep" />
            <span className="status-bar-text">
              {edgeCount} edge
              {edgeCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {activeView === 'mission' && missionPhase && (
          <span className="status-bar-text">
            PHASE: {missionPhase.toUpperCase()}
          </span>
        )}
        {activeView === 'map' && (
          <span className="status-bar-text">
            {entityCount} entit
            {entityCount !== 1 ? 'ies' : 'y'}
          </span>
        )}
      </div>
    </footer>
  )
}
