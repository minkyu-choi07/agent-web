'use client'

import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Wrench,
} from 'lucide-react'
import type { ToolCallEvent } from '@/store/chatStore'

export function ToolCallBlock({
  toolCall,
}: {
  toolCall: ToolCallEvent
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="my-1.5 border-l-2 border-hud-blue bg-hud-bg px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-hud-text-dim flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-hud-text-dim flex-shrink-0" />
        )}
        <Wrench className="w-3 h-3 text-hud-blue flex-shrink-0" />
        <span className="tag tag-blue">
          {toolCall.tool}
        </span>
      </button>
      {open && (
        <pre
          className="mt-2 text-[11px] text-hud-text-dim overflow-x-auto"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {JSON.stringify(toolCall.args, null, 2)}
        </pre>
      )}
    </div>
  )
}
