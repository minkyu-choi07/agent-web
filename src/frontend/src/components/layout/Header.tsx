'use client'

import { Settings, Trash2 } from 'lucide-react'
import { useFlowStore } from '@/store/flowStore'
import { DeployButton } from '@/components/flow/DeployButton'

export function Header() {
  const toggleSettingsPanel = useFlowStore(
    (s) => s.toggleSettingsPanel,
  )
  const clearFlow = useFlowStore((s) => s.clearFlow)
  const nodeCount = useFlowStore(
    (s) => s.nodes.length,
  )
  const edgeCount = useFlowStore(
    (s) => s.edges.length,
  )

  return (
    <header className="h-11 border-b border-hud-border bg-hud-surface flex items-center justify-between px-5">
      {/* Left */}
      <div className="flex items-center gap-3">
        <h1
          className="text-sm font-bold text-hud-accent tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ANVIL
        </h1>
        <span className="tag tag-accent">
          Flow Editor
        </span>
        <div
          className="hidden sm:flex items-center gap-3 ml-2 text-[10px] text-hud-text-dim"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span>
            {nodeCount} agent
            {nodeCount !== 1 ? 's' : ''}
          </span>
          <span className="text-hud-border-accent">
            {'//'}
          </span>
          <span>
            {edgeCount} edge
            {edgeCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <DeployButton />
        <div className="w-px h-5 bg-hud-border" />
        <button
          onClick={clearFlow}
          className="btn-ghost flex items-center gap-1.5"
          title="Clear canvas"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            Clear
          </span>
        </button>
        <button
          onClick={toggleSettingsPanel}
          className="btn-ghost flex items-center gap-1.5"
          title="Global settings"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            Settings
          </span>
        </button>
      </div>
    </header>
  )
}
