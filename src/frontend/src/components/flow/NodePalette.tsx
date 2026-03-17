'use client'

import { useState, useCallback } from 'react'
import {
  Search,
  Bot,
  Radio,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type PaletteItem = {
  type: string
  label: string
  description: string
  icon: typeof Bot
  accentColor: string
}

const paletteItems: PaletteItem[] = [
  {
    type: 'agent',
    label: 'Agent',
    description: 'LLM-powered agent node',
    icon: Bot,
    accentColor: 'text-hud-accent',
  },
  {
    type: 'connector',
    label: 'Connector',
    description: 'External data source',
    icon: Radio,
    accentColor: 'text-hud-blue',
  },
]

export function NodePalette({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = paletteItems.filter(
    (t) =>
      t.label
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      t.description
        .toLowerCase()
        .includes(search.toLowerCase()),
  )

  const onDragStart = useCallback(
    (event: React.DragEvent, item: PaletteItem) => {
      event.dataTransfer.setData(
        'application/champ-node-type',
        item.type,
      )
      event.dataTransfer.setData(
        'application/champ-node-label',
        item.label,
      )
      event.dataTransfer.effectAllowed = 'move'
    },
    [],
  )

  // Collapsed: slim icon strip
  if (collapsed) {
    return (
      <aside className="w-10 border-r border-hud-border bg-hud-surface flex flex-col items-center py-2 gap-2 flex-shrink-0">
        <button
          onClick={onToggle}
          className="w-7 h-7 flex items-center justify-center text-hud-text-dim hover:text-hud-accent hover:bg-hud-accent-dim transition-colors"
          title="Expand palette"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <div className="w-5 h-px bg-hud-border" />
        {paletteItems.map((item, idx) => (
          <div
            key={`${item.type}-${idx}`}
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            className="w-7 h-7 flex items-center justify-center border border-hud-border hover:border-hud-border-accent cursor-grab active:cursor-grabbing transition-colors"
            title={item.label}
          >
            <item.icon
              className={cn(
                'w-3.5 h-3.5',
                item.accentColor,
              )}
            />
          </div>
        ))}
      </aside>
    )
  }

  // Expanded
  return (
    <aside className="w-56 border-r border-hud-border bg-hud-surface flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-hud-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-hud-text-dim" />
          <h2
            className="text-[10px] font-semibold text-hud-text-dim uppercase tracking-[0.08em]"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            Nodes
          </h2>
        </div>
        <button
          onClick={onToggle}
          className="w-5 h-5 flex items-center justify-center text-hud-text-dim hover:text-hud-accent transition-colors"
          title="Collapse palette"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-hud-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-hud-text-dim" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="input-field !pl-7 !py-1.5 !text-[11px]"
          />
        </div>
      </div>

      {/* Draggable items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map((item, idx) => (
          <div
            key={`${item.type}-${idx}`}
            draggable
            onDragStart={(e) =>
              onDragStart(e, item)
            }
            className={cn(
              'group flex items-center gap-2.5 p-2 border border-hud-border bg-hud-surface-2',
              'hover:border-hud-border-accent hover:shadow-glow-accent-sm',
              'cursor-grab active:cursor-grabbing transition-all duration-150',
            )}
          >
            <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 border border-hud-border">
              <item.icon
                className={cn(
                  'w-3.5 h-3.5',
                  item.accentColor,
                )}
              />
            </div>
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold text-hud-text"
                style={{
                  fontFamily:
                    'var(--font-display)',
                }}
              >
                {item.label}
              </p>
              <p
                className="text-[9px] text-hud-text-dim truncate"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-hud-border">
        <p
          className="text-[9px] text-hud-text-dim text-center"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Drag to canvas
        </p>
      </div>
    </aside>
  )
}
