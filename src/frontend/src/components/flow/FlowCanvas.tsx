'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
  useReactFlow,
} from '@xyflow/react'
import {
  useFlowStore,
  type AppNode,
  defaultAgentNodeData,
  defaultAgentConfig,
  defaultConnectorNodeData,
  defaultKafkaConfig,
  defaultDisConfig,
  defaultUciConfig,
  defaultZmqConfig,
} from '@/store/flowStore'
import { AgentNode } from '@/components/flow/AgentNode'
import { ConnectorNode } from '@/components/flow/ConnectorNode'
import { DeletableEdge } from '@/components/flow/DeletableEdge'
import { useChatStore } from '@/store/chatStore'

let agentIdCounter = 0
function getNextAgentId() {
  return `agent-${Date.now()}-${agentIdCounter++}`
}

let connIdCounter = 0
function getNextConnectorId() {
  return `conn-${Date.now()}-${connIdCounter++}`
}

export function FlowCanvas() {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const onNodesChange = useFlowStore(
    (s) => s.onNodesChange,
  )
  const onEdgesChange = useFlowStore(
    (s) => s.onEdgesChange,
  )
  const onConnect = useFlowStore((s) => s.onConnect)
  const addNode = useFlowStore((s) => s.addNode)
  const setSelectedNode = useFlowStore(
    (s) => s.setSelectedNode,
  )
  const selectedNodeId = useFlowStore(
    (s) => s.selectedNodeId,
  )
  const openChat = useChatStore((s) => s.openChat)

  const { screenToFlowPosition, getViewport } =
    useReactFlow()

  // ── Copy / Paste ──────────────────────────────────
  const clipboardRef = useRef<AppNode | null>(null)

  useEffect(() => {
    const handleCopy = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'c' &&
        !e.shiftKey
      ) {
        // Don't intercept if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT'
        )
          return

        const sel = nodes.find(
          (n) => n.id === selectedNodeId,
        )
        if (sel) {
          clipboardRef.current = sel
        }
      }
    }

    const handlePaste = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'v' &&
        !e.shiftKey
      ) {
        const tag = (e.target as HTMLElement)?.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT'
        )
          return

        const src = clipboardRef.current
        if (!src) return

        e.preventDefault()

        // Offset position so it doesn't stack exactly on top
        const offset = 48

        if (src.type === 'agent' && 'agentId' in src.data) {
          const id = getNextAgentId()
          const newNode: AppNode = {
            id,
            type: 'agent',
            position: {
              x: src.position.x + offset,
              y: src.position.y + offset,
            },
            data: {
              ...JSON.parse(JSON.stringify(src.data)),
              agentId: id,
              name: `${src.data.name} (copy)`,
              status: 'idle',
            },
          }
          addNode(newNode)
          setSelectedNode(id)
        } else if (
          src.type === 'connector' &&
          'connectorId' in src.data
        ) {
          const id = getNextConnectorId()
          const newNode: AppNode = {
            id,
            type: 'connector',
            position: {
              x: src.position.x + offset,
              y: src.position.y + offset,
            },
            data: {
              ...JSON.parse(JSON.stringify(src.data)),
              connectorId: id,
              name: `${src.data.name} (copy)`,
              status: 'idle',
            },
          }
          addNode(newNode)
          setSelectedNode(id)
        }
      }
    }

    window.addEventListener('keydown', handleCopy)
    window.addEventListener('keydown', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleCopy)
      window.removeEventListener('keydown', handlePaste)
    }
  }, [nodes, selectedNodeId, addNode, setSelectedNode])

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      agent: AgentNode,
      connector: ConnectorNode,
    }),
    [],
  )

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      deletable: DeletableEdge,
    }),
    [],
  )

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    },
    [],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const nodeType = event.dataTransfer.getData(
        'application/anvil-node-type',
      )
      if (!nodeType) return

      const label = event.dataTransfer.getData(
        'application/anvil-node-label',
      )

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      if (nodeType === 'connector') {
        const id = getNextConnectorId()
        const newNode: AppNode = {
          id,
          type: 'connector',
          position,
          data: {
            ...defaultConnectorNodeData,
            connectorId: id,
            name: label || 'New Connector',
            kafkaConfig: { ...defaultKafkaConfig },
            disConfig: { ...defaultDisConfig },
            uciConfig: { ...defaultUciConfig },
            zmqConfig: { ...defaultZmqConfig },
          },
        }
        addNode(newNode)
      } else {
        const id = getNextAgentId()
        const newNode: AppNode = {
          id,
          type: 'agent',
          position,
          data: {
            ...defaultAgentNodeData,
            agentId: id,
            name: label || 'New Agent',
            agentConfig: {
              ...defaultAgentConfig,
            },
          },
        }
        addNode(newNode)
      }
    },
    [screenToFlowPosition, addNode],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: AppNode) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode],
  )

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: AppNode) => {
      if (
        node.type === 'agent' &&
        node.data &&
        'agentId' in node.data &&
        node.data.status === 'running'
      ) {
        openChat(node.data.agentId)
      }
    },
    [openChat],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  return (
    <div className="w-full h-full bg-hud-bg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{
          type: 'deletable',
          animated: false,
          selectable: true,
        }}
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255, 255, 255, 0.04)"
        />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(node) =>
            node.type === 'connector'
              ? '#4d8eff'
              : '#00e5a0'
          }
          maskColor="rgba(10, 12, 16, 0.8)"
          className="!bg-hud-surface"
        />
        <Controls />
      </ReactFlow>
    </div>
  )
}
