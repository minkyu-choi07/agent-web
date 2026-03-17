'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
  // Headings — tactical callout style
  h1: ({ children }) => (
    <div className="mt-3 mb-2 border-b border-hud-accent/30 pb-1">
      <h1
        className="text-sm font-bold text-hud-accent uppercase tracking-widest"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {children}
      </h1>
    </div>
  ),
  h2: ({ children }) => (
    <div className="mt-3 mb-1.5 flex items-center gap-2">
      <div className="w-1.5 h-1.5 bg-hud-accent flex-shrink-0" />
      <h2
        className="text-[13px] font-bold text-hud-accent uppercase tracking-wider"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {children}
      </h2>
    </div>
  ),
  h3: ({ children }) => (
    <h3
      className="mt-2 mb-1 text-xs font-semibold text-hud-text uppercase tracking-wider"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {'// '}{children}
    </h3>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="mb-2 text-[13px] leading-relaxed text-hud-text">
      {children}
    </p>
  ),

  // Bold — accent highlight
  strong: ({ children }) => (
    <strong className="font-semibold text-hud-accent">
      {children}
    </strong>
  ),

  // Italic
  em: ({ children }) => (
    <em className="text-hud-text-dim not-italic text-[12px] uppercase tracking-wider">
      {children}
    </em>
  ),

  // Inline code — tag style
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className={className}>{children}</code>
      )
    }
    return (
      <code className="px-1.5 py-0.5 bg-hud-accent-dim border border-hud-accent/15 text-hud-accent text-[12px]">
        {children}
      </code>
    )
  },

  // Code block — terminal style
  pre: ({ children }) => (
    <div className="my-2 border border-hud-border bg-hud-bg overflow-x-auto">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-hud-border bg-hud-surface">
        <div className="w-1.5 h-1.5 bg-hud-accent" />
        <span
          className="text-[9px] text-hud-text-dim uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Output
        </span>
      </div>
      <pre
        className="px-3 py-2 text-[12px] text-hud-text leading-relaxed"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {children}
      </pre>
    </div>
  ),

  // Lists — tactical bullet style
  ul: ({ children }) => (
    <ul className="mb-2 space-y-1 ml-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 space-y-1 ml-1 counter-reset-item">
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => {
    const ordered = (props as Record<string, unknown>).ordered
    return (
      <li className="flex gap-2 text-[13px] leading-relaxed text-hud-text">
        <span className="text-hud-accent flex-shrink-0 mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {ordered ? '>' : '▸'}
        </span>
        <span className="flex-1">{children}</span>
      </li>
    )
  },

  // Tables — HUD data grid
  table: ({ children }) => (
    <div className="my-2 border border-hud-border overflow-x-auto">
      <table className="w-full text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-hud-surface border-b border-hud-accent/30">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th
      className="px-3 py-1.5 text-left text-[10px] font-semibold text-hud-accent uppercase tracking-wider"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </th>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-hud-border">
      {children}
    </tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-hud-surface-2/50 transition-colors">
      {children}
    </tr>
  ),
  td: ({ children }) => (
    <td
      className="px-3 py-1.5 text-hud-text"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </td>
  ),

  // Blockquote — intel brief style
  blockquote: ({ children }) => (
    <div className="my-2 border-l-2 border-hud-blue bg-hud-blue-dim px-3 py-2">
      <div
        className="text-[9px] text-hud-blue uppercase tracking-widest mb-1"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Intel
      </div>
      <div className="text-[13px] text-hud-text">{children}</div>
    </div>
  ),

  // Horizontal rule — section divider
  hr: () => (
    <div className="my-3 flex items-center gap-2">
      <div className="flex-1 h-px bg-hud-border-accent" />
      <div className="w-1 h-1 bg-hud-accent" />
      <div className="flex-1 h-px bg-hud-border-accent" />
    </div>
  ),

  // Links
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-hud-blue underline underline-offset-2 decoration-hud-blue/40 hover:decoration-hud-blue transition-colors"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
}

export function TacticalMarkdown({
  content,
}: {
  content: string
}) {
  return (
    <div className="tactical-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
