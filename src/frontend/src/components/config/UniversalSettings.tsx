'use client'

import { useState, useCallback } from 'react'
import {
  X,
  Settings,
  Eye,
  EyeOff,
  Bot,
  Server,
  ChevronDown,
  Check,
  Loader2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useFlowStore } from '@/store/flowStore'

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
] as const

const DEFAULT_MODELS: Record<
  string,
  { value: string; label: string }[]
> = {
  anthropic: [
    {
      value: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
    },
    {
      value: 'claude-opus-4-20250514',
      label: 'Claude Opus 4',
    },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  google: [
    {
      value: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash',
    },
    {
      value: 'gemini-2.0-pro',
      label: 'Gemini 2.0 Pro',
    },
  ],
}

type ConfigureStatus = 'idle' | 'loading' | 'success' | 'error'

function ConfigSection({
  icon: Icon,
  title,
  ready,
  expanded,
  onToggle,
  onConfigure,
  configureDisabled,
  configuredAt,
  children,
}: {
  icon: typeof Bot
  title: string
  ready: boolean
  expanded: boolean
  onToggle: () => void
  onConfigure: () => Promise<void> | void
  configureDisabled: boolean
  configuredAt: string | null
  children: React.ReactNode
}) {
  const [status, setStatus] =
    useState<ConfigureStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleConfigure = useCallback(async () => {
    setStatus('loading')
    setErrorMsg('')
    try {
      await onConfigure()
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      const msg =
        err instanceof TypeError
          ? 'Server unreachable'
          : err instanceof Error
            ? err.message
            : 'Configuration failed'
      setErrorMsg(msg)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }, [onConfigure])

  return (
    <section>
      {/* Clickable header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 py-3 group"
      >
        <div
          className={cn(
            'w-6 h-6 flex items-center justify-center border flex-shrink-0',
            ready
              ? 'bg-hud-accent-dim border-hud-accent/20'
              : 'bg-hud-warning-dim border-hud-warning/20',
          )}
        >
          <Icon
            className={cn(
              'w-3.5 h-3.5',
              ready
                ? 'text-hud-accent'
                : 'text-hud-warning',
            )}
          />
        </div>
        <h3
          className="text-xs font-semibold text-hud-text uppercase tracking-wider"
          style={{
            fontFamily: 'var(--font-display)',
          }}
        >
          {title}
        </h3>
        <span
          className={cn(
            'status-xo',
            ready ? 'status-xo-on' : 'status-xo-off',
            !ready && 'status-indicator-blink',
          )}
        >
          {ready ? 'O' : 'X'}
        </span>

        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-hud-text-dim transition-transform duration-150 ml-auto',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.15,
              ease: 'easeOut',
            }}
            className="overflow-hidden"
          >
            <div className="pb-4 space-y-4">
              {children}

              {/* Configure button */}
              <div className="pt-1">
                <button
                  onClick={handleConfigure}
                  disabled={
                    configureDisabled ||
                    status === 'loading'
                  }
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-150',
                    status === 'success'
                      ? 'bg-hud-accent text-hud-bg'
                      : status === 'error'
                        ? 'bg-hud-warning text-hud-bg'
                        : configureDisabled
                          ? 'bg-hud-surface-2 text-hud-text-dim border border-hud-border cursor-not-allowed opacity-50'
                          : 'btn-primary',
                  )}
                  style={{
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Configuring...
                    </>
                  ) : status === 'success' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Configured
                    </>
                  ) : status === 'error' ? (
                    'Failed'
                  ) : (
                    'Configure'
                  )}
                </button>
                {status === 'error' && errorMsg && (
                  <p
                    className="text-[9px] text-hud-warning mt-1.5 text-center"
                    style={{
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {errorMsg}
                  </p>
                )}
                {configuredAt && status === 'idle' && (
                  <p
                    className="text-[9px] text-hud-text-dim mt-1.5 text-center"
                    style={{
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Last configured:{' '}
                    {new Date(
                      configuredAt,
                    ).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export function UniversalSettings() {
  const settings = useFlowStore(
    (s) => s.universalSettings,
  )
  const updateSettings = useFlowStore(
    (s) => s.updateUniversalSettings,
  )
  const anvilHost = useFlowStore((s) => s.anvilHost)
  const setAnvilHost = useFlowStore(
    (s) => s.setAnvilHost,
  )
  const llmConfiguredAt = useFlowStore(
    (s) => s.llmConfiguredAt,
  )
  const anvilConfiguredAt = useFlowStore(
    (s) => s.anvilConfiguredAt,
  )
  const configureLlm = useFlowStore(
    (s) => s.configureLlm,
  )
  const configureAnvil = useFlowStore(
    (s) => s.configureAnvil,
  )
  const togglePanel = useFlowStore(
    (s) => s.toggleSettingsPanel,
  )
  const [showKey, setShowKey] = useState(false)
  const [expandedSection, setExpandedSection] =
    useState<'llm' | 'anvil' | null>(null)

  const models =
    DEFAULT_MODELS[settings.provider] ?? []
  const llmReady = !!llmConfiguredAt
  const anvilReady = !!anvilConfiguredAt

  const toggle = (section: 'llm' | 'anvil') =>
    setExpandedSection((v) =>
      v === section ? null : section,
    )

  const handleConfigureLlm =
    useCallback(async () => {
      const host =
        useFlowStore.getState().anvilHost
      if (!host) {
        throw new Error(
          'Configure Anvil host first',
        )
      }
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host,
          path: '/llm/status',
          method: 'GET',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(
          () => ({}),
        )
        throw new Error(
          data.error || `Failed (${res.status})`,
        )
      }
      configureLlm()
    }, [configureLlm])

  const handleConfigureAnvil =
    useCallback(async () => {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: anvilHost,
          path: '/ping',
          method: 'GET',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(
          () => ({}),
        )
        throw new Error(
          data.error || `Failed (${res.status})`,
        )
      }
      configureAnvil()
    }, [anvilHost, configureAnvil])

  const llmFieldsFilled =
    !!settings.apiKey && !!settings.defaultModel
  const anvilFieldsFilled = !!anvilHost

  return (
    <motion.aside
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{
        duration: 0.15,
        ease: 'easeOut',
      }}
      className="w-80 border-l border-hud-border bg-hud-surface flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hud-border">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-hud-text-dim" />
          <h2
            className="text-xs font-semibold text-hud-text uppercase tracking-wider"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            Global Config
          </h2>
        </div>
        <button
          onClick={togglePanel}
          className="p-1 text-hud-text-dim hover:text-hud-text hover:bg-hud-surface-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {/* ── LLM Client ─────────────────────────── */}
        <ConfigSection
          icon={Bot}
          title="LLM Client"
          ready={llmReady}
          expanded={expandedSection === 'llm'}
          onToggle={() => toggle('llm')}
          onConfigure={handleConfigureLlm}
          configureDisabled={!llmFieldsFilled}
          configuredAt={llmConfiguredAt}
        >
          {/* Provider */}
          <div>
            <label className="label">Provider</label>
            <select
              value={settings.provider}
              onChange={(e) =>
                updateSettings({
                  provider: e.target
                    .value as typeof settings.provider,
                  defaultModel:
                    DEFAULT_MODELS[
                      e.target.value
                    ]?.[0]?.value ?? '',
                })
              }
              className="input-field"
            >
              {PROVIDERS.map((p) => (
                <option
                  key={p.value}
                  value={p.value}
                >
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="label">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) =>
                  updateSettings({
                    apiKey: e.target.value,
                  })
                }
                className="input-field !pr-10"
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hud-text-dim hover:text-hud-accent transition-colors"
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p
              className="text-[10px] text-hud-text-dim mt-1.5"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              LOCAL STORAGE ONLY. NEVER TRANSMITTED.
            </p>
          </div>

          {/* Default Model */}
          <div>
            <label className="label">
              Default Model
            </label>
            <select
              value={settings.defaultModel}
              onChange={(e) =>
                updateSettings({
                  defaultModel: e.target.value,
                })
              }
              className="input-field"
            >
              {models.map((m) => (
                <option
                  key={m.value}
                  value={m.value}
                >
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </ConfigSection>

        {/* Divider */}
        <div className="border-t border-hud-border" />

        {/* ── Anvil ──────────────────────────────── */}
        <ConfigSection
          icon={Server}
          title="Anvil"
          ready={anvilReady}
          expanded={expandedSection === 'anvil'}
          onToggle={() => toggle('anvil')}
          onConfigure={handleConfigureAnvil}
          configureDisabled={!anvilFieldsFilled}
          configuredAt={anvilConfiguredAt}
        >
          {/* Server Host */}
          <div>
            <label className="label">
              Server Host
            </label>
            <input
              type="text"
              value={anvilHost}
              onChange={(e) =>
                setAnvilHost(e.target.value)
              }
              className="input-field"
              placeholder="http://localhost:8000"
            />
            <p
              className="text-[10px] text-hud-text-dim mt-1.5"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              BACKEND ENDPOINT FOR FLOW EXECUTION.
            </p>
          </div>
        </ConfigSection>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-hud-border">
        <p
          className="text-[10px] text-hud-text-dim text-center uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Persisted to localStorage
        </p>
      </div>
    </motion.aside>
  )
}
