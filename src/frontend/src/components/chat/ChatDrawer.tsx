'use client'

import { useCallback, useRef, useState } from 'react'
import {
  X,
  Trash2,
  MessageSquare,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/store/chatStore'
import { useDeployStore } from '@/store/deployStore'
import { useFlowStore } from '@/store/flowStore'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'

function AgentTab({
  agentId,
  name,
  status,
  active,
  onClick,
}: {
  agentId: string
  name: string
  status: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider transition-all w-full text-left',
        active
          ? 'bg-hud-accent-dim border-l-2 border-hud-accent text-hud-accent'
          : 'border-l-2 border-transparent text-hud-text-dim hover:text-hud-text hover:bg-hud-surface-2',
      )}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      <div
        className={cn(
          'pulse-dot !w-[5px] !h-[5px] flex-shrink-0',
          status === 'running'
            ? 'bg-hud-accent'
            : status === 'error'
              ? 'bg-hud-warning'
              : 'bg-hud-text-dim',
        )}
      />
      <span className="truncate">{name}</span>
    </button>
  )
}

export function ChatPanel() {
  const chatDrawerOpen = useChatStore(
    (s) => s.chatDrawerOpen,
  )
  const activeAgentId = useChatStore(
    (s) => s.activeAgentId,
  )
  const conversations = useChatStore(
    (s) => s.conversations,
  )
  const isStreaming = useChatStore((s) => s.isStreaming)
  const closeChat = useChatStore((s) => s.closeChat)
  const setActiveAgent = useChatStore(
    (s) => s.setActiveAgent,
  )
  const sendMessage = useChatStore(
    (s) => s.sendMessage,
  )
  const clearConversation = useChatStore(
    (s) => s.clearConversation,
  )

  const deployedAgentIds = useDeployStore(
    (s) => s.deployedAgentIds,
  )
  const nodes = useFlowStore((s) => s.nodes)

  const [width, setWidth] = useState(320)
  const dragRef = useRef<{
    startX: number
    startW: number
  } | null>(null)

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = {
        startX: e.clientX,
        startW: width,
      }
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta =
          ev.clientX - dragRef.current.startX
        setWidth(
          Math.max(
            260,
            Math.min(
              600,
              dragRef.current.startW + delta,
            ),
          ),
        )
      }
      const onUp = () => {
        dragRef.current = null
        document.removeEventListener(
          'mousemove',
          onMove,
        )
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [width],
  )

  const sendMessageWithFile = useChatStore(
    (s) => s.sendMessageWithFile,
  )

  const handleSend = useCallback(
    (message: string) => {
      if (!activeAgentId) return
      sendMessage(activeAgentId, message)
    },
    [activeAgentId, sendMessage],
  )

  const handleSendWithFile = useCallback(
    (message: string, file: File) => {
      if (!activeAgentId) return
      sendMessageWithFile(
        activeAgentId,
        message,
        file,
      )
    },
    [activeAgentId, sendMessageWithFile],
  )

  const handleClear = useCallback(() => {
    if (!activeAgentId) return
    clearConversation(activeAgentId)
  }, [activeAgentId, clearConversation])

  if (!chatDrawerOpen) return null

  // Get deployed agent nodes for tabs
  const agentTabs = deployedAgentIds
    .map((aid) => {
      const node = nodes.find(
        (n) =>
          n.type === 'agent' &&
          n.data &&
          'agentId' in n.data &&
          n.data.agentId === aid,
      )
      if (!node || !('name' in node.data)) return null
      return {
        agentId: aid,
        name: node.data.name as string,
        status: node.data.status as string,
      }
    })
    .filter(Boolean) as {
    agentId: string
    name: string
    status: string
  }[]

  const messages = activeAgentId
    ? conversations[activeAgentId] || []
    : []

  return (
    <div
      className="border-r border-hud-border bg-hud-surface flex flex-col overflow-hidden flex-shrink-0 relative"
      style={{ width }}
    >
      {/* Resize handle (right edge) */}
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize z-10 group flex items-center justify-center hover:bg-hud-accent/10 transition-colors"
      >
        <GripVertical className="w-2.5 h-2.5 text-hud-text-dim opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
      {/* Header */}
      <div className="px-3 py-2 border-b border-hud-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-hud-accent" />
          <h2
            className="text-[10px] font-semibold text-hud-accent uppercase tracking-[0.08em]"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            Comms
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClear}
            className="w-5 h-5 flex items-center justify-center text-hud-text-dim hover:text-hud-warning transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            onClick={closeChat}
            className="w-5 h-5 flex items-center justify-center text-hud-text-dim hover:text-hud-text transition-colors"
            title="Close comms"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Agent tabs — vertical list */}
      {agentTabs.length > 1 && (
        <div className="border-b border-hud-border flex-shrink-0 max-h-32 overflow-y-auto">
          {agentTabs.map((tab) => (
            <AgentTab
              key={tab.agentId}
              agentId={tab.agentId}
              name={tab.name}
              status={tab.status}
              active={tab.agentId === activeAgentId}
              onClick={() =>
                setActiveAgent(tab.agentId)
              }
            />
          ))}
        </div>
      )}

      {/* Single agent header when only 1 */}
      {agentTabs.length === 1 && agentTabs[0] && (
        <div className="px-3 py-1.5 border-b border-hud-border flex items-center gap-2 flex-shrink-0">
          <div
            className={cn(
              'pulse-dot !w-[5px] !h-[5px]',
              agentTabs[0].status === 'running'
                ? 'bg-hud-accent'
                : 'bg-hud-text-dim',
            )}
          />
          <span
            className="text-[10px] text-hud-text uppercase tracking-wider truncate"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            {agentTabs[0].name}
          </span>
        </div>
      )}

      {/* Messages */}
      {activeAgentId ? (
        <>
          <ChatMessageList messages={messages} />
          <ChatInput
            onSend={handleSend}
            onSendWithFile={handleSendWithFile}
            disabled={isStreaming}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p
            className="text-[10px] text-hud-text-dim uppercase tracking-wider"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            Select agent to begin
          </p>
        </div>
      )}
    </div>
  )
}

// Keep named export for backwards compat
export { ChatPanel as ChatDrawer }
