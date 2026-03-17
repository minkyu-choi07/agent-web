'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  X,
  Bot,
  Trash2,
  ChevronDown,
  Plus,
  Rocket,
  Loader2,
  Settings,
  FileText,
  Brain,
  FolderOpen,
  RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  useFlowStore,
  type AgentNode as AgentNodeType,
  type AgentNodeData,
  type LlmConfig,
  type ReasoningConfig,
  defaultAgentNodeData,
} from '@/store/flowStore'
import { useDeployStore } from '@/store/deployStore'
import { useChatStore } from '@/store/chatStore'
import { anvilApi } from '@/lib/anvilApi'

const AVAILABLE_TOOLS = [
  'AGENT_MESSAGE_SERVER',
  'GRAPH_RAG_CLOUD_SERVER',
  'MDMP_PLAN_SERVER',
  'TEXT_TO_SQL_CLOUD_SERVER',
]

// ── Shared Section component ────────────────────────────────────

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(
    defaultOpen ?? false,
  )
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2"
      >
        <span
          className="label !mb-0"
          style={{
            fontFamily: 'var(--font-mono)',
          }}
        >
          {title}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-hud-text-dim transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
            }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.15,
              ease: 'easeOut',
            }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pb-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Deploy Button ───────────────────────────────────────────────

function AgentDeployButton({
  nodeId,
}: {
  nodeId: string | null
}) {
  const deployStatus = useDeployStore((s) => s.status)
  const deployedAgentIds = useDeployStore(
    (s) => s.deployedAgentIds,
  )
  const deployAgents = useDeployStore(
    (s) => s.deployAgents,
  )
  const nodes = useFlowStore((s) => s.nodes)

  const node = nodes.find((n) => n.id === nodeId)
  const agentId =
    node?.data && 'agentId' in node.data
      ? node.data.agentId
      : null
  const isDeployed = agentId
    ? deployedAgentIds.includes(agentId)
    : false
  const isDeploying = deployStatus === 'deploying'

  if (isDeployed) {
    return (
      <div
        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-hud-accent bg-hud-accent-dim border border-hud-accent/20"
        style={{
          fontFamily: 'var(--font-display)',
        }}
      >
        <div className="pulse-dot !w-[6px] !h-[6px] bg-hud-accent" />
        Deployed
      </div>
    )
  }

  return (
    <button
      onClick={() => {
        if (nodeId) deployAgents([nodeId])
      }}
      disabled={isDeploying || !nodeId}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-hud-accent border border-hud-accent/30 hover:bg-hud-accent hover:text-hud-bg hover:shadow-glow-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        fontFamily: 'var(--font-display)',
      }}
    >
      {isDeploying ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Rocket className="w-3.5 h-3.5" />
      )}
      Deploy Agent
    </button>
  )
}

// ── Agent Intel View (shown when deployed) ──────────────────────

type WorkspaceFile = {
  name: string
  size: number
  uploaded_at: string
}

function AgentIntelView({
  agentId,
  agentName,
  nodeId,
  onShowConfig,
}: {
  agentId: string
  agentName: string
  nodeId: string
  onShowConfig: () => void
}) {
  const [files, setFiles] = useState<WorkspaceFile[]>(
    [],
  )
  const [loadingFiles, setLoadingFiles] = useState(false)
  const conversations = useChatStore(
    (s) => s.conversations,
  )
  const closeConfigPanel = useFlowStore(
    (s) => s.closeConfigPanel,
  )

  const messages = conversations[agentId] || []
  const messageCount = messages.length
  const userMsgCount = messages.filter(
    (m) => m.role === 'user',
  ).length
  const toolCallCount = messages.reduce(
    (sum, m) => sum + m.toolCalls.length,
    0,
  )

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const res = (await anvilApi.listAgentFiles(
        agentId,
      )) as { files: WorkspaceFile[] }
      setFiles(res.files || [])
    } catch {
      setFiles([])
    }
    setLoadingFiles(false)
  }, [agentId])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

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
          <div className="pulse-dot !w-[6px] !h-[6px] bg-hud-accent shadow-glow-accent-sm" />
          <h2
            className="text-xs font-semibold text-hud-accent uppercase tracking-wider"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            {agentName}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onShowConfig}
            className="p-1 text-hud-text-dim hover:text-hud-accent hover:bg-hud-accent-dim transition-colors"
            title="Show configuration"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={closeConfigPanel}
            className="p-1 text-hud-text-dim hover:text-hud-text hover:bg-hud-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {/* ── Status ──────────────────────── */}
        <div className="mb-3">
          <div
            className="text-[9px] text-hud-text-dim uppercase tracking-widest mb-2"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            Status
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-hud-surface-2 border border-hud-border px-2.5 py-2 text-center">
              <p
                className="text-lg font-bold text-hud-accent"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {messageCount}
              </p>
              <p
                className="text-[8px] text-hud-text-dim uppercase tracking-wider"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Messages
              </p>
            </div>
            <div className="bg-hud-surface-2 border border-hud-border px-2.5 py-2 text-center">
              <p
                className="text-lg font-bold text-hud-blue"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {toolCallCount}
              </p>
              <p
                className="text-[8px] text-hud-text-dim uppercase tracking-wider"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Tool Calls
              </p>
            </div>
            <div className="bg-hud-surface-2 border border-hud-border px-2.5 py-2 text-center">
              <p
                className="text-lg font-bold text-hud-text"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {files.length}
              </p>
              <p
                className="text-[8px] text-hud-text-dim uppercase tracking-wider"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Files
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-hud-border" />

        {/* ── Files ───────────────────────── */}
        <Section title="Workspace Files" defaultOpen>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3 h-3 text-hud-blue" />
              <span
                className="text-[10px] text-hud-text-dim"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                .build/{agentId}/uploads/
              </span>
            </div>
            <button
              onClick={fetchFiles}
              disabled={loadingFiles}
              className="text-hud-text-dim hover:text-hud-accent transition-colors"
              title="Refresh"
            >
              <RefreshCw
                className={cn(
                  'w-3 h-3',
                  loadingFiles && 'animate-spin',
                )}
              />
            </button>
          </div>

          {files.length === 0 ? (
            <p
              className="text-[10px] text-hud-text-dim text-center py-3"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              No files uploaded
            </p>
          ) : (
            <div className="space-y-1">
              {files.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-hud-surface-2 border border-hud-border"
                >
                  <FileText className="w-3.5 h-3.5 text-hud-blue flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[11px] text-hud-text truncate"
                      style={{
                        fontFamily:
                          'var(--font-mono)',
                      }}
                    >
                      {f.name}
                    </p>
                  </div>
                  <span
                    className="text-[9px] text-hud-text-dim flex-shrink-0"
                    style={{
                      fontFamily:
                        'var(--font-mono)',
                    }}
                  >
                    {formatSize(f.size)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <div className="border-t border-hud-border" />

        {/* ── Memory (conversation summary) ── */}
        <Section title="Memory" defaultOpen>
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3 h-3 text-hud-purple" />
            <span
              className="text-[10px] text-hud-text-dim"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              Conversation History
            </span>
          </div>

          {messages.length === 0 ? (
            <p
              className="text-[10px] text-hud-text-dim text-center py-3"
              style={{
                fontFamily: 'var(--font-mono)',
              }}
            >
              No conversations yet
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {messages
                .filter(
                  (m) =>
                    m.role === 'user' ||
                    m.role === 'agent',
                )
                .slice(-10)
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex gap-2 px-2 py-1.5 bg-hud-surface-2 border border-hud-border"
                  >
                    <span
                      className={cn(
                        'text-[9px] uppercase tracking-wider flex-shrink-0 mt-0.5',
                        m.role === 'user'
                          ? 'text-hud-accent'
                          : 'text-hud-blue',
                      )}
                      style={{
                        fontFamily:
                          'var(--font-mono)',
                      }}
                    >
                      {m.role === 'user'
                        ? 'USR'
                        : 'AGT'}
                    </span>
                    <p
                      className="text-[10px] text-hud-text-dim line-clamp-2"
                      style={{
                        fontFamily:
                          'var(--font-mono)',
                      }}
                    >
                      {m.content.slice(0, 120)}
                      {m.content.length > 120
                        ? '...'
                        : ''}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </Section>
      </div>

      {/* Footer — agent ID */}
      <div className="px-4 py-2 border-t border-hud-border">
        <p
          className="text-[9px] text-hud-text-dim text-center truncate"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {agentId}
        </p>
      </div>
    </motion.aside>
  )
}

// ── Main Export ──────────────────────────────────────────────────

export function AgentConfigPanel() {
  const selectedNodeId = useFlowStore(
    (s) => s.selectedNodeId,
  )
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const updateNodeData = useFlowStore(
    (s) => s.updateNodeData,
  )
  const removeNode = useFlowStore(
    (s) => s.removeNode,
  )
  const closeConfigPanel = useFlowStore(
    (s) => s.closeConfigPanel,
  )
  const universalSettings = useFlowStore(
    (s) => s.universalSettings,
  )
  const deployedAgentIds = useDeployStore(
    (s) => s.deployedAgentIds,
  )

  const [forceConfig, setForceConfig] = useState(false)

  const node = useMemo(
    () =>
      nodes.find(
        (n) =>
          n.id === selectedNodeId &&
          n.type === 'agent',
      ) as AgentNodeType | undefined,
    [nodes, selectedNodeId],
  )

  // Reset forceConfig when selecting a different node
  useEffect(() => {
    setForceConfig(false)
  }, [selectedNodeId])

  const incomingCount = useMemo(
    () =>
      edges.filter(
        (e) => e.target === selectedNodeId,
      ).length,
    [edges, selectedNodeId],
  )
  const outgoingCount = useMemo(
    () =>
      edges.filter(
        (e) => e.source === selectedNodeId,
      ).length,
    [edges, selectedNodeId],
  )

  const update = useCallback(
    (
      field: keyof AgentNodeData,
      value: AgentNodeData[keyof AgentNodeData],
    ) => {
      if (!selectedNodeId) return
      updateNodeData(selectedNodeId, {
        [field]: value,
      })
    },
    [selectedNodeId, updateNodeData],
  )

  const updateLlm = useCallback(
    (field: keyof LlmConfig, value: string) => {
      if (!node) return
      updateNodeData(node.id, {
        agentConfig: {
          ...node.data.agentConfig,
          llmConfig: {
            ...node.data.agentConfig.llmConfig,
            [field]: value,
          },
        },
      })
    },
    [node, updateNodeData],
  )

  const updateReasoning = useCallback(
    (
      field: keyof ReasoningConfig,
      value: string,
    ) => {
      if (!node) return
      updateNodeData(node.id, {
        agentConfig: {
          ...node.data.agentConfig,
          reasoningConfig: {
            ...node.data.agentConfig
              .reasoningConfig,
            [field]: value,
          },
        },
      })
    },
    [node, updateNodeData],
  )

  const toggleTool = useCallback(
    (tool: string) => {
      if (!node) return
      const current =
        node.data.agentConfig.toolConfig.toolsList
      const next = current.includes(tool)
        ? current.filter((t) => t !== tool)
        : [...current, tool]
      updateNodeData(node.id, {
        agentConfig: {
          ...node.data.agentConfig,
          toolConfig: { toolsList: next },
        },
      })
    },
    [node, updateNodeData],
  )

  if (!node) return null

  // Check if deployed → show intel view
  const isDeployed = deployedAgentIds.includes(
    node.data.agentId,
  )

  if (isDeployed && !forceConfig) {
    return (
      <AgentIntelView
        agentId={node.data.agentId}
        agentName={node.data.name}
        nodeId={node.id}
        onShowConfig={() => setForceConfig(true)}
      />
    )
  }

  // Global LLM config as fallback
  const globalLlm = {
    modelType: universalSettings.provider,
    modelName: universalSettings.defaultModel,
    endpoint: '',
    apiVersion: '',
  }

  const nodeLlm = node.data.agentConfig?.llmConfig
  const data: AgentNodeData = {
    ...defaultAgentNodeData,
    ...node.data,
    agentConfig: {
      ...defaultAgentNodeData.agentConfig,
      ...node.data.agentConfig,
      llmConfig: {
        modelType:
          nodeLlm?.modelType || globalLlm.modelType,
        modelName:
          nodeLlm?.modelName || globalLlm.modelName,
        endpoint:
          nodeLlm?.endpoint || globalLlm.endpoint,
        apiVersion:
          nodeLlm?.apiVersion ||
          globalLlm.apiVersion,
      },
      reasoningConfig: {
        ...defaultAgentNodeData.agentConfig
          .reasoningConfig,
        ...node.data.agentConfig?.reasoningConfig,
      },
      toolConfig: {
        ...defaultAgentNodeData.agentConfig
          .toolConfig,
        ...node.data.agentConfig?.toolConfig,
      },
    },
  }

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
          <Bot className="w-4 h-4 text-hud-accent" />
          <h2
            className="text-xs font-semibold text-hud-text uppercase tracking-wider"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            Agent Config
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {isDeployed && (
            <button
              onClick={() => setForceConfig(false)}
              className="p-1 text-hud-text-dim hover:text-hud-accent hover:bg-hud-accent-dim transition-colors"
              title="Back to intel view"
            >
              <Brain className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={closeConfigPanel}
            className="p-1 text-hud-text-dim hover:text-hud-text hover:bg-hud-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <Section title="Identity" defaultOpen>
          <div>
            <label className="label">Agent ID</label>
            <input
              type="text"
              value={data.agentId}
              onChange={(e) =>
                update('agentId', e.target.value)
              }
              className="input-field"
              placeholder="commander-1"
            />
          </div>
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={data.name}
              onChange={(e) =>
                update('name', e.target.value)
              }
              className="input-field"
              placeholder="Agent name"
            />
          </div>
          <div>
            <label className="label">
              Deployment
            </label>
            <input
              type="text"
              value={data.deployment}
              onChange={(e) =>
                update(
                  'deployment',
                  e.target.value,
                )
              }
              className="input-field"
              placeholder="seit"
            />
          </div>
        </Section>

        <div className="border-t border-hud-border" />

        <Section title="LLM Config">
          <div>
            <label className="label">
              Model Type
            </label>
            <input
              type="text"
              value={
                data.agentConfig.llmConfig.modelType
              }
              onChange={(e) =>
                updateLlm(
                  'modelType',
                  e.target.value,
                )
              }
              className="input-field"
              placeholder="azure_openai"
            />
          </div>
          <div>
            <label className="label">
              Model Name
            </label>
            <input
              type="text"
              value={
                data.agentConfig.llmConfig.modelName
              }
              onChange={(e) =>
                updateLlm(
                  'modelName',
                  e.target.value,
                )
              }
              className="input-field"
              placeholder="gpt-4o"
            />
          </div>
          <div>
            <label className="label">Endpoint</label>
            <input
              type="text"
              value={
                data.agentConfig.llmConfig.endpoint
              }
              onChange={(e) =>
                updateLlm(
                  'endpoint',
                  e.target.value,
                )
              }
              className="input-field"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="label">
              API Version
            </label>
            <input
              type="text"
              value={
                data.agentConfig.llmConfig.apiVersion
              }
              onChange={(e) =>
                updateLlm(
                  'apiVersion',
                  e.target.value,
                )
              }
              className="input-field"
              placeholder="2024-02-15-preview"
            />
          </div>
        </Section>

        <div className="border-t border-hud-border" />

        <Section title="Reasoning Config">
          <div>
            <label className="label">
              Reasoning Module
            </label>
            <input
              type="text"
              value={
                data.agentConfig.reasoningConfig
                  .reasoningName
              }
              onChange={(e) =>
                updateReasoning(
                  'reasoningName',
                  e.target.value,
                )
              }
              className="input-field"
              placeholder="module_name"
            />
          </div>
        </Section>

        <div className="border-t border-hud-border" />

        <Section title="Tool Config">
          <div className="space-y-1.5">
            {AVAILABLE_TOOLS.map((tool) => {
              const active =
                data.agentConfig.toolConfig.toolsList.includes(
                  tool,
                )
              return (
                <button
                  key={tool}
                  onClick={() => toggleTool(tool)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-left border transition-all duration-100',
                    active
                      ? 'border-hud-accent/30 bg-hud-accent-dim'
                      : 'border-hud-border bg-hud-surface-2 hover:border-hud-border-accent',
                  )}
                >
                  <div
                    className={cn(
                      'w-3 h-3 border flex items-center justify-center flex-shrink-0',
                      active
                        ? 'border-hud-accent bg-hud-accent'
                        : 'border-hud-border-accent',
                    )}
                  >
                    {active && (
                      <Plus className="w-2 h-2 text-hud-bg rotate-45" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium tracking-wide',
                      active
                        ? 'text-hud-accent'
                        : 'text-hud-text-dim',
                    )}
                    style={{
                      fontFamily:
                        'var(--font-mono)',
                    }}
                  >
                    {tool}
                  </span>
                </button>
              )
            })}
          </div>
        </Section>

        <div className="border-t border-hud-border" />

        <Section title="Connections">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span
                className="text-hud-text-dim"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                LEADER (IN)
              </span>
              <span className="tag tag-blue">
                {incomingCount}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span
                className="text-hud-text-dim"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                SUB-AGENTS (OUT)
              </span>
              <span className="tag tag-accent">
                {outgoingCount}
              </span>
            </div>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-hud-border space-y-2">
        <AgentDeployButton nodeId={selectedNodeId} />
        <button
          onClick={() => {
            if (selectedNodeId)
              removeNode(selectedNodeId)
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-hud-warning bg-hud-warning-dim border border-hud-warning/20 hover:border-hud-warning/40 hover:shadow-glow-warning transition-all"
          style={{
            fontFamily: 'var(--font-display)',
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Terminate Agent
        </button>
      </div>
    </motion.aside>
  )
}
