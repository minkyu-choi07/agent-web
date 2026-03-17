'use client'

import {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react'
import {
  Send,
  Paperclip,
  X,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/store/chatStore'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ChatInput({
  onSend,
  onSendWithFile,
  disabled,
}: {
  onSend: (message: string) => void
  onSendWithFile?: (
    message: string,
    file: File,
  ) => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pick up pending file from store (e.g. dropped on agent node)
  const pendingFile = useChatStore(
    (s) => s.pendingFile,
  )
  const setPendingFile = useChatStore(
    (s) => s.setPendingFile,
  )

  useEffect(() => {
    if (pendingFile) {
      setFile(pendingFile)
      setPendingFile(null)
    }
  }, [pendingFile, setPendingFile])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (disabled) return

    if (file && onSendWithFile) {
      onSendWithFile(trimmed, file)
      setValue('')
      setFile(null)
      return
    }

    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }, [value, file, disabled, onSend, onSendWithFile])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) setFile(f)
      e.target.value = ''
    },
    [],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer.files?.[0]
      if (f) setFile(f)
    },
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(true)
    },
    [],
  )

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  return (
    <div
      className={cn(
        'border-t border-hud-border bg-hud-surface transition-colors relative',
        dragOver && 'bg-hud-accent-dim',
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* File chip */}
      {file && (
        <div className="px-3 pt-2 pb-0">
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-hud-surface-2 border border-hud-border text-[11px]">
            <FileText className="w-3.5 h-3.5 text-hud-blue flex-shrink-0" />
            <span
              className="text-hud-text truncate max-w-[160px]"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              {file.name}
            </span>
            <span className="text-hud-text-dim">
              {formatSize(file.size)}
            </span>
            <button
              onClick={() => setFile(null)}
              className="text-hud-text-dim hover:text-hud-warning transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 w-8 h-[36px] flex items-center justify-center text-hud-text-dim hover:text-hud-accent transition-colors disabled:opacity-30"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            file
              ? 'Add a message about this file...'
              : 'Send a message...'
          }
          disabled={disabled}
          rows={1}
          className="input-field flex-1 resize-none min-h-[36px] max-h-[100px] py-2 text-[13px]"
          style={{
            height: 'auto',
            overflow: value.includes('\n')
              ? 'auto'
              : 'hidden',
          }}
        />
        <button
          onClick={handleSend}
          disabled={
            disabled || (!value.trim() && !file)
          }
          className="btn-primary px-3 py-2 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Drop zone overlay */}
      {dragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-hud-bg/80 border-2 border-dashed border-hud-accent pointer-events-none z-10">
          <span
            className="text-sm text-hud-accent font-semibold uppercase tracking-wider"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            Drop file here
          </span>
        </div>
      )}
    </div>
  )
}
