'use client'

import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFlowStore } from '@/store/flowStore'
import { useDeployStore } from '@/store/deployStore'

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
  const anvilConfiguredAt = useFlowStore(
    (s) => s.anvilConfiguredAt,
  )
  const toggleSettingsPanel = useFlowStore(
    (s) => s.toggleSettingsPanel,
  )

  const deployStatus = useDeployStore((s) => s.status)

  const llmReady = !!llmConfiguredAt
  const anvilReady = !!anvilConfiguredAt
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
          ready={anvilReady}
          label="ANVIL"
          onGearClick={toggleSettingsPanel}
        />
        <span className="status-bar-sep" />
        <StatusItem
          ready={deployReady}
          label="DEPLOY"
        />
      </div>

      {/* Right: flow stats */}
      <div className="flex items-center gap-3">
        <span className="status-bar-text">
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}
        </span>
        <span className="status-bar-sep" />
        <span className="status-bar-text">
          {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
        </span>
      </div>
    </footer>
  )
}
