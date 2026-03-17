'use client'

import {
  Settings,
  Trash2,
  GitBranch,
  Target,
  Map,
  LogOut,
  User,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useFlowStore } from '@/store/flowStore'
import {
  useMissionStore,
  type ActiveView,
} from '@/store/missionStore'
import { useAuthStore } from '@/store/authStore'
import { DeployButton } from '@/components/flow/DeployButton'
import { MissionPicker } from '@/components/layout/MissionPicker'

const TABS: {
  key: ActiveView
  label: string
  icon: typeof GitBranch
}[] = [
  { key: 'flow', label: 'FLOW', icon: GitBranch },
  { key: 'mission', label: 'MISSION', icon: Target },
  { key: 'map', label: 'MAP', icon: Map },
]

export function Header() {
  const router = useRouter()
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

  const activeView = useMissionStore(
    (s) => s.activeView,
  )
  const setActiveView = useMissionStore(
    (s) => s.setActiveView,
  )
  const entityCount = useMissionStore(
    (s) => s.entities.length,
  )

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <header className="h-11 border-b border-hud-border bg-hud-surface flex items-center justify-between px-5">
      {/* Left */}
      <div className="flex items-center gap-3">
        <h1
          className="text-sm font-bold text-hud-accent tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          CHAMP
        </h1>

        <div className="w-px h-5 bg-hud-border" />
        <MissionPicker />
        <div className="w-px h-5 bg-hud-border" />

        {/* Tab navigation */}
        <div className="flex items-center gap-0.5 ml-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeView === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium tracking-wider uppercase transition-all duration-150',
                  isActive
                    ? 'text-hud-accent bg-hud-accent/10 border-b-2 border-hud-accent'
                    : 'text-hud-text-dim hover:text-hud-text hover:bg-hud-surface-2 border-b-2 border-transparent',
                )}
                style={{
                  fontFamily: 'var(--font-display)',
                }}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
                {tab.key === 'map' &&
                  entityCount > 0 && (
                    <span className="tag tag-accent ml-1 text-[9px] py-0 px-1">
                      {entityCount}
                    </span>
                  )}
              </button>
            )
          })}
        </div>

        {/* Flow stats (only visible in flow tab) */}
        {activeView === 'flow' && (
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
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {activeView === 'flow' && (
          <>
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
          </>
        )}
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

        {user && (
          <>
            <div className="w-px h-5 bg-hud-border" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-hud-text-dim">
                <User className="w-3 h-3" />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {user.name}
                </span>
              </div>
              <button
                onClick={() => {
                  logout()
                  router.push('/login')
                }}
                className="btn-ghost flex items-center gap-1"
                title="Sign out"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
