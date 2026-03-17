'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  X,
  Radio,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  useFlowStore,
  type ConnectorNode as ConnectorNodeType,
  type ConnectorNodeData,
  type KafkaConfig,
  type DisConfig,
  type UciConfig,
  type ZmqConfig,
  defaultConnectorNodeData,
} from '@/store/flowStore'

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

export function ConnectorConfigPanel() {
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

  const node = useMemo(
    () =>
      nodes.find(
        (n) =>
          n.id === selectedNodeId &&
          n.type === 'connector',
      ) as ConnectorNodeType | undefined,
    [nodes, selectedNodeId],
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
      field: keyof ConnectorNodeData,
      value: ConnectorNodeData[keyof ConnectorNodeData],
    ) => {
      if (!selectedNodeId) return
      updateNodeData(selectedNodeId, {
        [field]: value,
      })
    },
    [selectedNodeId, updateNodeData],
  )

  const updateKafka = useCallback(
    (
      field: keyof KafkaConfig,
      value: string,
    ) => {
      if (!node) return
      updateNodeData(node.id, {
        kafkaConfig: {
          ...node.data.kafkaConfig,
          [field]: value,
        },
      })
    },
    [node, updateNodeData],
  )

  const updateDis = useCallback(
    (
      field: keyof DisConfig,
      value: string | number,
    ) => {
      if (!node) return
      updateNodeData(node.id, {
        disConfig: {
          ...node.data.disConfig,
          [field]: value,
        },
      })
    },
    [node, updateNodeData],
  )

  const updateUci = useCallback(
    (
      field: keyof UciConfig,
      value: string | number,
    ) => {
      if (!node) return
      updateNodeData(node.id, {
        uciConfig: {
          ...node.data.uciConfig,
          [field]: value,
        },
      })
    },
    [node, updateNodeData],
  )

  const updateZmq = useCallback(
    (
      field: keyof ZmqConfig,
      value: string,
    ) => {
      if (!node) return
      updateNodeData(node.id, {
        zmqConfig: {
          ...node.data.zmqConfig,
          [field]: value,
        },
      })
    },
    [node, updateNodeData],
  )

  if (!node) return null

  // Merge with defaults to handle stale nodes from localStorage
  const data: ConnectorNodeData = {
    ...defaultConnectorNodeData,
    ...node.data,
    kafkaConfig: {
      ...defaultConnectorNodeData.kafkaConfig,
      ...node.data.kafkaConfig,
    },
    disConfig: {
      ...defaultConnectorNodeData.disConfig,
      ...node.data.disConfig,
    },
    uciConfig: {
      ...defaultConnectorNodeData.uciConfig,
      ...node.data.uciConfig,
    },
    zmqConfig: {
      ...defaultConnectorNodeData.zmqConfig,
      ...node.data.zmqConfig,
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
          <Radio className="w-4 h-4 text-hud-blue" />
          <h2
            className="text-xs font-semibold text-hud-text uppercase tracking-wider"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            Connector Config
          </h2>
        </div>
        <button
          onClick={closeConfigPanel}
          className="p-1 text-hud-text-dim hover:text-hud-text hover:bg-hud-surface-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {/* ── Identity ───────────────────────── */}
        <Section title="Identity" defaultOpen>
          <div>
            <label className="label">
              Connector ID
            </label>
            <input
              type="text"
              value={data.connectorId}
              onChange={(e) =>
                update(
                  'connectorId',
                  e.target.value,
                )
              }
              className="input-field"
              placeholder="kafka-ingest-1"
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
              placeholder="Connector name"
            />
          </div>
        </Section>

        <div className="border-t border-hud-border" />

        {/* ── Protocol ─────────────────────────── */}
        <Section title="Protocol" defaultOpen>
          <div>
            <label className="label">
              Protocol
            </label>
            <select
              value={data.protocol}
              onChange={(e) =>
                update('protocol', e.target.value)
              }
              className="input-field"
            >
              <option value="zmq">ZMQ</option>
              <option value="kafka">Kafka</option>
              <option value="dis">DIS</option>
              <option value="uci">UCI</option>
            </select>
          </div>
        </Section>

        <div className="border-t border-hud-border" />

        {/* ── ZMQ Config ──────────────────────── */}
        {data.protocol === 'zmq' && (
          <>
            <Section title="ZMQ Config" defaultOpen>
              <div>
                <label className="label">
                  Endpoint
                </label>
                <input
                  type="text"
                  value={data.zmqConfig.endpoint}
                  onChange={(e) =>
                    updateZmq(
                      'endpoint',
                      e.target.value,
                    )
                  }
                  className="input-field"
                  placeholder="tcp://localhost:5555"
                />
              </div>
              <div>
                <label className="label">
                  Topic Filter
                </label>
                <input
                  type="text"
                  value={data.zmqConfig.topic}
                  onChange={(e) =>
                    updateZmq(
                      'topic',
                      e.target.value,
                    )
                  }
                  className="input-field"
                  placeholder="(empty = all messages)"
                />
              </div>
            </Section>
            <div className="border-t border-hud-border" />
          </>
        )}

        {/* ── Kafka Config ─────────────────────── */}
        {data.protocol === 'kafka' && (
          <>
            <Section title="Kafka Config" defaultOpen>
              <div>
                <label className="label">
                  Brokers
                </label>
                <input
                  type="text"
                  value={data.kafkaConfig.brokers}
                  onChange={(e) =>
                    updateKafka(
                      'brokers',
                      e.target.value,
                    )
                  }
                  className="input-field"
                  placeholder="localhost:9092"
                />
              </div>
              <div>
                <label className="label">
                  Topic
                </label>
                <input
                  type="text"
                  value={data.kafkaConfig.topic}
                  onChange={(e) =>
                    updateKafka(
                      'topic',
                      e.target.value,
                    )
                  }
                  className="input-field"
                  placeholder="my-topic"
                />
              </div>
              <div>
                <label className="label">
                  Group ID
                </label>
                <input
                  type="text"
                  value={data.kafkaConfig.groupId}
                  onChange={(e) =>
                    updateKafka(
                      'groupId',
                      e.target.value,
                    )
                  }
                  className="input-field"
                  placeholder="consumer-group-1"
                />
              </div>
            </Section>
            <div className="border-t border-hud-border" />
          </>
        )}

        {/* ── DIS Config ───────────────────────── */}
        {data.protocol === 'dis' && (
          <>
            <Section title="DIS Config" defaultOpen>
              <div>
                <label className="label">
                  Multicast Address
                </label>
                <input
                  type="text"
                  value={
                    data.disConfig.multicastAddress
                  }
                  onChange={(e) =>
                    updateDis(
                      'multicastAddress',
                      e.target.value,
                    )
                  }
                  className="input-field"
                  placeholder="239.1.2.3"
                />
              </div>
              <div>
                <label className="label">
                  Port
                </label>
                <input
                  type="number"
                  value={data.disConfig.port}
                  onChange={(e) =>
                    updateDis(
                      'port',
                      parseInt(
                        e.target.value,
                        10,
                      ) || 0,
                    )
                  }
                  className="input-field"
                  placeholder="3000"
                />
              </div>
              <div>
                <label className="label">
                  Exercise ID
                </label>
                <input
                  type="number"
                  value={data.disConfig.exerciseId}
                  onChange={(e) =>
                    updateDis(
                      'exerciseId',
                      parseInt(
                        e.target.value,
                        10,
                      ) || 0,
                    )
                  }
                  className="input-field"
                  placeholder="1"
                />
              </div>
            </Section>
            <div className="border-t border-hud-border" />
          </>
        )}

        {/* ── UCI Config ───────────────────────── */}
        {data.protocol === 'uci' && (
          <>
            <Section title="UCI Config" defaultOpen>
              <div>
                <label className="label">
                  Host
                </label>
                <input
                  type="text"
                  value={data.uciConfig.host}
                  onChange={(e) =>
                    updateUci(
                      'host',
                      e.target.value,
                    )
                  }
                  className="input-field"
                  placeholder="localhost"
                />
              </div>
              <div>
                <label className="label">
                  Port
                </label>
                <input
                  type="number"
                  value={data.uciConfig.port}
                  onChange={(e) =>
                    updateUci(
                      'port',
                      parseInt(
                        e.target.value,
                        10,
                      ) || 0,
                    )
                  }
                  className="input-field"
                  placeholder="4000"
                />
              </div>
            </Section>
            <div className="border-t border-hud-border" />
          </>
        )}

        {/* ── Connections ──────────────────────── */}
        <Section title="Connections">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span
                className="text-hud-text-dim"
                style={{
                  fontFamily: 'var(--font-mono)',
                }}
              >
                TARGET AGENTS (OUT)
              </span>
              <span className="tag tag-blue">
                {outgoingCount}
              </span>
            </div>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-hud-border">
        <button
          onClick={() => {
            if (selectedNodeId)
              removeNode(selectedNodeId)
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-hud-blue bg-hud-blue-dim border border-hud-blue/20 hover:border-hud-blue/40 hover:shadow-glow-blue transition-all"
          style={{
            fontFamily: 'var(--font-display)',
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove Connector
        </button>
      </div>
    </motion.aside>
  )
}
