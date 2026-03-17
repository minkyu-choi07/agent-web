'use client'

import { memo, useCallback } from 'react'
import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react'
import { Radio, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useFlowStore,
  type ConnectorNode as ConnectorNodeType,
} from '@/store/flowStore'

const statusStyles: Record<
  string,
  { color: string; glow: string }
> = {
  idle: {
    color: 'bg-hud-text-dim',
    glow: '',
  },
  connected: {
    color: 'bg-hud-blue',
    glow: '',
  },
  receiving: {
    color: 'bg-hud-blue',
    glow: 'shadow-glow-blue',
  },
  error: {
    color: 'bg-hud-warning',
    glow: 'shadow-glow-warning',
  },
}

function getConnectionSummary(
  data: ConnectorNodeType['data'],
): string {
  switch (data.protocol) {
    case 'kafka': {
      const cfg = data.kafkaConfig
      if (!cfg?.brokers && !cfg?.topic)
        return 'Click to configure...'
      return [cfg.brokers, cfg.topic]
        .filter(Boolean)
        .join(' / ')
    }
    case 'dis': {
      const cfg = data.disConfig
      if (!cfg?.multicastAddress)
        return 'Click to configure...'
      return `${cfg.multicastAddress}:${cfg.port ?? 3000}`
    }
    case 'uci': {
      const cfg = data.uciConfig
      if (!cfg?.host)
        return 'Click to configure...'
      return `${cfg.host}:${cfg.port ?? 4000}`
    }
    case 'zmq': {
      const cfg = data.zmqConfig
      if (!cfg?.endpoint)
        return 'Click to configure...'
      return [cfg.endpoint, cfg.topic]
        .filter(Boolean)
        .join(' / ')
    }
    default:
      return 'Click to configure...'
  }
}

function ConnectorNodeComponent({
  id,
  data,
  selected,
}: NodeProps<ConnectorNodeType>) {
  const removeNode = useFlowStore(
    (s) => s.removeNode,
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
    },
    [id, removeNode],
  )

  const status =
    statusStyles[data.status] || statusStyles.idle

  return (
    <div
      className={cn(
        'group relative w-56 border transition-all duration-150',
        selected
          ? 'border-hud-blue bg-hud-surface shadow-glow-blue'
          : 'border-hud-border bg-hud-surface hover:border-hud-border-accent',
      )}
    >
      {/* Input handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-blue transition-colors"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-blue transition-colors"
      />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-hud-border">
        <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 bg-hud-blue-dim border border-hud-blue/20">
          <Radio className="w-4 h-4 text-hud-blue" />
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
          {data.protocol && (
            <p
              className="text-[10px] text-hud-text-dim truncate uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              {data.protocol}
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
          {getConnectionSummary(data)}
        </p>
      </div>

      {/* Delete (hover) */}
      <button
        onClick={handleDelete}
        className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-hud-warning text-hud-bg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      {/* Output handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-blue transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!w-3 !h-3 !border-2 !border-hud-surface !bg-hud-border-accent hover:!bg-hud-blue transition-colors"
      />
    </div>
  )
}

export const ConnectorNode = memo(
  ConnectorNodeComponent,
)
