'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Target } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { Header } from '@/components/layout/Header'
import { NodePalette } from '@/components/flow/NodePalette'
import { FlowCanvas } from '@/components/flow/FlowCanvas'
import { AgentConfigPanel } from '@/components/config/AgentConfigPanel'
import { ConnectorConfigPanel } from '@/components/config/ConnectorConfigPanel'
import { UniversalSettings } from '@/components/config/UniversalSettings'
import { StatusBar } from '@/components/layout/StatusBar'
import { ChatPanel } from '@/components/chat/ChatDrawer'
import { MapPane } from '@/components/map/MapPane'
import { MissionPlanner } from '@/components/mission/MissionPlanner'
import {
  useFlowStore,
  serializeFlowToPayload,
} from '@/store/flowStore'
import { useChatStore } from '@/store/chatStore'
import { useMissionStore } from '@/store/missionStore'
import {
  saveMissionSnapshot,
  loadMissionSnapshot,
} from '@/store/missionSnapshot'
import { champApi } from '@/lib/champApi'

export function FlowEditor() {
  const configPanelOpen = useFlowStore(
    (s) => s.configPanelOpen,
  )
  const settingsPanelOpen = useFlowStore(
    (s) => s.settingsPanelOpen,
  )
  const selectedNodeId = useFlowStore(
    (s) => s.selectedNodeId,
  )
  const nodes = useFlowStore((s) => s.nodes)
  const selectedNodeType = nodes.find(
    (n) => n.id === selectedNodeId,
  )?.type

  const chatOpen = useChatStore(
    (s) => s.chatDrawerOpen,
  )

  const activeView = useMissionStore(
    (s) => s.activeView,
  )

  const activeMissionId = useMissionStore(
    (s) => s.activeMissionId,
  )

  const [paletteCollapsed, setPaletteCollapsed] =
    useState(false)

  // Fetch missions from backend on mount (covers incognito / new browser)
  const fetchMissions = useMissionStore(
    (s) => s.fetchMissions,
  )
  useEffect(() => {
    fetchMissions()
  }, [fetchMissions])

  // Restore flow snapshot on hard refresh (hydrated activeMissionId but empty nodes)
  const hasRestoredRef = useRef(false)
  useEffect(() => {
    if (hasRestoredRef.current) return
    if (!activeMissionId) return
    // Only restore if flow is empty (i.e. hard refresh wiped in-memory state)
    const { nodes: currentNodes } =
      useFlowStore.getState()
    if (currentNodes.length === 0) {
      loadMissionSnapshot(activeMissionId)
    }
    hasRestoredRef.current = true
  }, [activeMissionId])

  // Auto-save active mission on tab close / navigation
  useEffect(() => {
    function handleBeforeUnload() {
      const id =
        useMissionStore.getState().activeMissionId
      if (id) saveMissionSnapshot(id)
    }
    window.addEventListener(
      'beforeunload',
      handleBeforeUnload,
    )
    return () =>
      window.removeEventListener(
        'beforeunload',
        handleBeforeUnload,
      )
  }, [])

  // Auto-save flow config as XML to backend on every edit (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const edges = useFlowStore((s) => s.edges)

  const flushFlowConfig = useCallback(() => {
    const mid = useMissionStore.getState().activeMissionId
    if (!mid) return
    const st = useFlowStore.getState()
    if (st.nodes.length === 0) return
    // Save XML config
    const payload = serializeFlowToPayload(st.nodes, st.edges)
    champApi.saveFlowConfig(mid, payload).catch(() => {})
    // Save full snapshot (nodes with positions + edges) for cross-browser sync
    champApi
      .saveFlowSnapshot(mid, {
        nodes: st.nodes as unknown as Record<string, unknown>[],
        edges: st.edges as unknown as Record<string, unknown>[],
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!activeMissionId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(flushFlowConfig, 2000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [nodes, edges, activeMissionId, flushFlowConfig])

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />

        {!activeMissionId ? (
          <NoMissionGate />
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Flow view */}
            {activeView === 'flow' && (
              <>
                <NodePalette
                  collapsed={
                    chatOpen || paletteCollapsed
                  }
                  onToggle={() =>
                    setPaletteCollapsed((p) => !p)
                  }
                />
                {chatOpen && <ChatPanel />}
                <div className="flex-1 relative">
                  <FlowCanvas />
                </div>
                {configPanelOpen &&
                  selectedNodeType === 'agent' && (
                    <AgentConfigPanel />
                  )}
                {configPanelOpen &&
                  selectedNodeType ===
                    'connector' && (
                    <ConnectorConfigPanel />
                  )}
              </>
            )}

            {/* Mission view */}
            {activeView === 'mission' && (
              <MissionPlanner />
            )}

            {/* Map view */}
            {activeView === 'map' && <MapPane />}

            {/* Settings panel (available on all views) */}
            {settingsPanelOpen && (
              <UniversalSettings />
            )}
          </div>
        )}

        <StatusBar />
      </div>
    </ReactFlowProvider>
  )
}

// ── Gate shown when no mission is active ─────────────────────────

function NoMissionGate() {
  const missions = useMissionStore((s) => s.missions)
  const switchMission = useMissionStore(
    (s) => s.switchMission,
  )
  const createMission = useMissionStore(
    (s) => s.createMission,
  )

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const handleCreate = () => {
    if (!name.trim()) return
    createMission(name.trim(), desc.trim())
    setName('')
    setDesc('')
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md panel border border-hud-border p-8 space-y-6">
        {/* Icon + title */}
        <div className="text-center space-y-2">
          <Target className="w-8 h-8 text-hud-accent mx-auto" />
          <h2
            className="text-sm font-bold text-hud-accent tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            SELECT OR CREATE A MISSION
          </h2>
          <p
            className="text-[11px] text-hud-text-dim"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            All work is scoped to a mission.
          </p>
        </div>

        {/* Existing missions */}
        {missions.length > 0 && (
          <div className="space-y-1.5">
            <span
              className="text-[10px] font-medium text-hud-text-dim tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-display)',
              }}
            >
              EXISTING MISSIONS
            </span>
            <div className="max-h-[160px] overflow-y-auto no-scrollbar space-y-1">
              {missions.map((m) => (
                <button
                  key={m.id}
                  onClick={() => switchMission(m.id)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-hud-border hover:border-hud-accent/40 hover:bg-hud-accent/5 transition-all group"
                >
                  <span
                    className="text-[11px] font-medium text-hud-text tracking-wider uppercase truncate"
                    style={{
                      fontFamily:
                        'var(--font-display)',
                    }}
                  >
                    {m.name}
                  </span>
                  <span
                    className="text-[9px] text-hud-text-dim tracking-widest uppercase"
                    style={{
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {m.phase}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        {missions.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-hud-border" />
            <span
              className="text-[9px] text-hud-text-dim tracking-widest"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              OR
            </span>
            <div className="flex-1 h-px bg-hud-border" />
          </div>
        )}

        {/* Create new */}
        <div className="space-y-3">
          <span
            className="text-[10px] font-medium text-hud-text-dim tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            NEW MISSION
          </span>
          <input
            type="text"
            placeholder="Mission name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field w-full"
            onKeyDown={(e) =>
              e.key === 'Enter' && handleCreate()
            }
          />
          <textarea
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="input-field w-full resize-none"
            rows={2}
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className={cn(
              'btn-primary w-full justify-center',
              !name.trim() &&
                'opacity-40 cursor-not-allowed',
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            CREATE MISSION
          </button>
        </div>
      </div>
    </div>
  )
}
