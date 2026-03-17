'use client'

import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react'
import type { ToolResultEvent } from '@/store/chatStore'

export function ToolResultBlock({
  toolResult,
}: {
  toolResult: ToolResultEvent
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="my-1.5 border-l-2 border-hud-accent bg-hud-bg px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-hud-text-dim flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-hud-text-dim flex-shrink-0" />
        )}
        <Check className="w-3 h-3 text-hud-accent flex-shrink-0" />
        <span className="text-[11px] text-hud-text-dim uppercase tracking-wider">
          Result: {toolResult.tool}
        </span>
      </button>
      {open && (
        <pre
          className="mt-2 text-[11px] text-hud-text-dim overflow-x-auto max-h-40"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {typeof toolResult.result === 'string'
            ? toolResult.result
            : JSON.stringify(toolResult.result, null, 2)}
        </pre>
      )}
    </div>
  )
}
