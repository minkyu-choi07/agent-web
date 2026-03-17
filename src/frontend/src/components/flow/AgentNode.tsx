'use client'

import { memo, useCallback, useState } from 'react'
import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react'
import {
  Bot,
  Trash2,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useFlowStore,
  type AgentNode as AgentNodeType,
} from '@/store/flowStore'
import { useChatStore } from '@/store/chatStore'

const statusStyles: Record<
  string,
  { color: string; glow: string }
> = {
  idle: {
    color: 'bg-hud-text-dim',
    glow: '',
  },
  running: {
    color: 'bg-hud-accent',
    glow: 'shadow-glow-accent-sm',
  },
  completed: {
    color: 'bg-hud-accent',
    glow: '',
  },
  error: {
    color: 'bg-hud-warning',
    glow: 'shadow-glow-warning',
  },
}

function AgentNodeComponent({
  id,
  data,
  selected,
}: NodeProps<AgentNodeType>) {
  const removeNode = useFlowStore(
    (s) => s.removeNode,
  )
  const openChat = useChatStore((s) => s.openChat)
  const setPendingFile = useChatStore(
    (s) => s.setPendingFile,
  )
  const [fileDragOver, setFileDragOver] = useState(false)

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
    },
    [id, removeNode],
  )

  const handleChat = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      openChat(data.agentId)
    },
    [data.agentId, openChat],
  )

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      // Only handle file drops, not node drags
      if (e.dataTransfer.files.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      setFileDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && data.status === 'running') {
        setPendingFile(file)
        openChat(data.agentId)
      }
    },
    [data.agentId, data.status, openChat, setPendingFile],
  )

  const handleFileDragOver = useCallback(
    (e: React.DragEvent) => {
      if (
        e.dataTransfer.types.includes('Files') &&
        data.status === 'running'
      ) {
        e.preventDefault()
        e.stopPropagation()
        setFileDragOver(true)
      }
    },
    [data.status],
  )

  const handleFileDragLeave = useCallback(() => {
    setFileDragOver(false)
  }, [])

  const status =
    statusStyles[data.status] || statusStyles.idle
  const isRunning = data.status === 'running'

  return (
    <div
      className={cn(
        'group relative w-56 border transition-all duration-150',
        selected
          ? 'border-hud-accent bg-hud-surface shadow-glow-accent'
          : 'border-hud-border bg-hud-surface hover:border-hud-border-accent',
        fileDragOver &&
          'border-hud-blue bg-hud-blue-dim shadow-glow-blue',
      )}
      onDrop={handleFileDrop}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
    >
      {/* Input handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-accent transition-colors"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-accent transition-colors"
      />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-hud-border">
        <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 bg-hud-accent-dim border border-hud-accent/20">
          <Bot className="w-4 h-4 text-hud-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold text-hud-text truncate"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            {data.name || 'UNNAMED'}
          </p>
          {data.deployment && (
            <p
              className="text-[10px] text-hud-text-dim truncate"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              {data.deployment}
            </p>
          )}
        </div>
        {/* Status dot */}
        <div
          className={cn(
            'pulse-dot flex-shrink-0',
            status.color,
            status.glow,
          )}
        />
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p
          className="text-xs text-hud-text-dim line-clamp-2"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {data.agentId || 'Click to configure...'}
        </p>
      </div>

      {/* Delete (hover) */}
      <button
        onClick={handleDelete}
        className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-hud-warning text-hud-bg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      {/* Chat button (visible when running) */}
      {isRunning && (
        <button
          onClick={handleChat}
          className="absolute -bottom-2.5 -right-2.5 w-6 h-6 bg-hud-accent text-hud-bg flex items-center justify-center shadow-glow-accent-sm hover:shadow-glow-accent transition-shadow"
          title="Open chat"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Output handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-accent transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-accent transition-colors"
      />
    </div>
  )
}

export const AgentNode = memo(AgentNodeComponent)
