'use client'

import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Header } from '@/components/layout/Header'
import { NodePalette } from '@/components/flow/NodePalette'
import { FlowCanvas } from '@/components/flow/FlowCanvas'
import { AgentConfigPanel } from '@/components/config/AgentConfigPanel'
import { ConnectorConfigPanel } from '@/components/config/ConnectorConfigPanel'
import { UniversalSettings } from '@/components/config/UniversalSettings'
import { StatusBar } from '@/components/layout/StatusBar'
import { ChatPanel } from '@/components/chat/ChatDrawer'
import { useFlowStore } from '@/store/flowStore'
import { useChatStore } from '@/store/chatStore'

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

  const [paletteCollapsed, setPaletteCollapsed] =
    useState(false)

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 flex overflow-hidden">
          {/* Left side: Palette + Chat */}
          <NodePalette
            collapsed={chatOpen || paletteCollapsed}
            onToggle={() =>
              setPaletteCollapsed((p) => !p)
            }
          />
          {chatOpen && <ChatPanel />}

          {/* Center: Canvas */}
          <div className="flex-1 relative">
            <FlowCanvas />
          </div>

          {/* Right side: Config panels */}
          {configPanelOpen &&
            selectedNodeType === 'agent' && (
              <AgentConfigPanel />
            )}
          {configPanelOpen &&
            selectedNodeType === 'connector' && (
              <ConnectorConfigPanel />
            )}
          {settingsPanelOpen && (
            <UniversalSettings />
          )}
        </div>
        <StatusBar />
      </div>
    </ReactFlowProvider>
  )
}
