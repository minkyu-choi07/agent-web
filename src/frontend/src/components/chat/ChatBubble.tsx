'use client'

import {
  Bot,
  User,
  ArrowRight,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { TacticalMarkdown } from './TacticalMarkdown'
import type { ChatMessage } from '@/store/chatStore'
import { useFlowStore } from '@/store/flowStore'

function getAgentName(agentId: string): string {
  const nodes = useFlowStore.getState().nodes
  const node = nodes.find(
    (n) =>
      n.type === 'agent' &&
      n.data &&
      'agentId' in n.data &&
      n.data.agentId === agentId,
  )
  return node?.data && 'name' in node.data
    ? (node.data.name as string)
    : agentId
}

export function ChatBubble({
  message,
}: {
  message: ChatMessage
}) {
  // Inter-agent message
  if (message.isInterAgentMessage) {
    const sourceName = message.sourceAgentId
      ? getAgentName(message.sourceAgentId)
      : '?'
    const targetName = message.targetAgentId
      ? getAgentName(message.targetAgentId)
      : '?'

    return (
      <div className="flex justify-center my-2">
        <div className="border-l-2 border-hud-purple bg-hud-purple-dim px-3 py-2 max-w-[90%]">
          <div
            className="flex items-center gap-2 text-[10px] text-hud-purple uppercase tracking-wider mb-1"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>{sourceName}</span>
            <ArrowRight className="w-3 h-3" />
            <span>{targetName}</span>
          </div>
          <p className="text-xs text-hud-text-dim">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  // System message
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-1">
        <span
          className="text-[10px] text-hud-text-dim px-3 py-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {message.content}
        </span>
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-2 my-2',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {/* Agent icon */}
      {!isUser && (
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 bg-hud-surface-2 border border-hud-border mt-0.5">
          <Bot className="w-3.5 h-3.5 text-hud-accent" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] px-3 py-2 text-sm',
          isUser
            ? 'bg-hud-accent-dim border border-hud-accent/20 text-hud-text'
            : 'bg-hud-surface-2 border border-hud-border text-hud-text',
        )}
      >
        {/* Tool calls (before text) */}
        {!isUser &&
          message.toolCalls.map((tc, i) => (
            <ToolCallBlock key={i} toolCall={tc} />
          ))}

        {/* Tool results */}
        {!isUser &&
          message.toolResults.map((tr, i) => (
            <ToolResultBlock key={i} toolResult={tr} />
          ))}

        {/* File attachment chip */}
        {message.file && (
          <div className="flex items-center gap-2 mb-1.5 px-2 py-1.5 bg-hud-bg border border-hud-border">
            <FileText className="w-3.5 h-3.5 text-hud-blue flex-shrink-0" />
            <span
              className="text-[11px] text-hud-text truncate"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              {message.file.name}
            </span>
            <span className="text-[10px] text-hud-text-dim flex-shrink-0">
              {message.file.size < 1024
                ? `${message.file.size} B`
                : message.file.size < 1024 * 1024
                  ? `${(message.file.size / 1024).toFixed(1)} KB`
                  : `${(message.file.size / (1024 * 1024)).toFixed(1)} MB`}
            </span>
          </div>
        )}

        {/* Text content */}
        {message.content && isUser && (
          <p
            className="whitespace-pre-wrap text-[13px] leading-relaxed"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            {message.content}
          </p>
        )}
        {message.content && !isUser && (
          <div>
            <TacticalMarkdown
              content={message.content}
            />
            {message.status === 'streaming' && (
              <span className="streaming-cursor">
                _
              </span>
            )}
          </div>
        )}

        {/* Streaming with no content yet */}
        {!message.content &&
          message.status === 'streaming' &&
          message.toolCalls.length === 0 && (
            <span className="streaming-cursor text-hud-accent">
              _
            </span>
          )}

        {/* Error */}
        {message.status === 'error' && (
          <p className="text-xs text-hud-warning mt-1">
            Error: {message.content}
          </p>
        )}
      </div>

      {/* User icon */}
      {isUser && (
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 bg-hud-accent-dim border border-hud-accent/20 mt-0.5">
          <User className="w-3.5 h-3.5 text-hud-accent" />
        </div>
      )}
    </div>
  )
}
