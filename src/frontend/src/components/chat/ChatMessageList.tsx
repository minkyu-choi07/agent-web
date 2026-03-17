'use client'

import { useEffect, useRef } from 'react'
import { ChatBubble } from './ChatBubble'
import type { ChatMessage } from '@/store/chatStore'

export function ChatMessageList({
  messages,
}: {
  messages: ChatMessage[]
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-4">
        <p
          className="text-[10px] text-hud-text-dim uppercase tracking-wider leading-relaxed"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          No messages yet.
          <br />
          Send a message to begin.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {messages.map((msg) => (
        <ChatBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
