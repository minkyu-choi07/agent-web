import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerStore } from '@/store/storeRegistry'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react'

// ---- Types ----

export type LlmConfig = {
  modelType: string
  modelName: string
  endpoint: string
  apiVersion: string
}

export type ReasoningConfig = {
  reasoningName: string
}

export type ToolConfig = {
  toolsList: string[]
}

export type AgentConfigPayload = {
  llmConfig: LlmConfig
  reasoningConfig: ReasoningConfig
  toolConfig: ToolConfig
}

export type AgentNodeData = {
  agentId: string
  name: string
  deployment: string
  kwargs: Record<string, unknown>
  agentConfig: AgentConfigPayload
  status: 'idle' | 'running' | 'completed' | 'error'
}

export type AgentNode = Node<AgentNodeData, 'agent'>

export type ConnectorProtocol = 'zmq' | 'kafka' | 'dis' | 'uci'

export type KafkaConfig = {
  brokers: string
  topic: string
  groupId: string
}

export type DisConfig = {
  multicastAddress: string
  port: number
  exerciseId: number
  entityTypes: string[]
}

export type UciConfig = {
  host: string
  port: number
}

export type ZmqConfig = {
  endpoint: string
  topic: string
}

export type ConnectorNodeData = {
  connectorId: string
  name: string
  protocol: ConnectorProtocol
  kafkaConfig: KafkaConfig
  disConfig: DisConfig
  uciConfig: UciConfig
  zmqConfig: ZmqConfig
  status: 'idle' | 'connected' | 'receiving' | 'error'
}

export type ConnectorNode = Node<ConnectorNodeData, 'connector'>

export type AppNode = AgentNode | ConnectorNode

export type UniversalSettings = {
  provider: 'anthropic' | 'openai' | 'google'
  apiKey: string
  defaultModel: string
}

export type FlowState = {
  nodes: AppNode[]
  edges: Edge[]
  selectedNodeId: string | null
  universalSettings: UniversalSettings
  champHost: string
  llmConfiguredAt: string | null
  champConfiguredAt: string | null
  configPanelOpen: boolean
  settingsPanelOpen: boolean
}

export type FlowActions = {
  onNodesChange: OnNodesChange<AppNode>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (node: AppNode) => void
  updateNodeData: (
    id: string,
    data: Partial<AgentNodeData> | Partial<ConnectorNodeData>,
  ) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  updateEdgeData: (
    id: string,
    data: Record<string, unknown>,
  ) => void
  setSelectedNode: (id: string | null) => void
  openConfigPanel: () => void
  closeConfigPanel: () => void
  toggleSettingsPanel: () => void
  updateUniversalSettings: (
    settings: Partial<UniversalSettings>,
  ) => void
  setChampHost: (host: string) => void
  configureLlm: () => void
  configureChamp: () => void
  setNodeStatus: (id: string, status: string) => void
  clearFlow: () => void
}

// ---- Defaults ----

const defaultUniversalSettings: UniversalSettings = {
  provider: 'anthropic',
  apiKey: '',
  defaultModel: 'claude-sonnet-4-20250514',
}

export const defaultLlmConfig: LlmConfig = {
  modelType: '',
  modelName: '',
  endpoint: '',
  apiVersion: '',
}

export const defaultReasoningConfig: ReasoningConfig = {
  reasoningName: '',
}

export const defaultToolConfig: ToolConfig = {
  toolsList: [],
}

export const defaultAgentConfig: AgentConfigPayload = {
  llmConfig: { ...defaultLlmConfig },
  reasoningConfig: { ...defaultReasoningConfig },
  toolConfig: { ...defaultToolConfig },
}

export const defaultAgentNodeData: AgentNodeData = {
  agentId: '',
  name: 'New Agent',
  deployment: 'seit',
  kwargs: {},
  agentConfig: { ...defaultAgentConfig },
  status: 'idle',
}

export const defaultKafkaConfig: KafkaConfig = {
  brokers: 'localhost:9092',
  topic: '',
  groupId: '',
}

export const defaultDisConfig: DisConfig = {
  multicastAddress: '239.1.2.3',
  port: 3000,
  exerciseId: 1,
  entityTypes: [],
}

export const defaultUciConfig: UciConfig = {
  host: 'localhost',
  port: 4000,
}

export const defaultZmqConfig: ZmqConfig = {
  endpoint: 'tcp://localhost:5555',
  topic: '',
}

export const defaultConnectorNodeData: ConnectorNodeData = {
  connectorId: '',
  name: 'New Connector',
  protocol: 'zmq',
  kafkaConfig: { ...defaultKafkaConfig },
  disConfig: { ...defaultDisConfig },
  uciConfig: { ...defaultUciConfig },
  zmqConfig: { ...defaultZmqConfig },
  status: 'idle',
}

// ---- Payload serializer ----

export function serializeFlowToPayload(
  nodes: AppNode[],
  edges: Edge[],
) {
  const agentNodes = nodes.filter(
    (n): n is AgentNode => n.type === 'agent',
  )
  const connectorNodes = nodes.filter(
    (n): n is ConnectorNode => n.type === 'connector',
  )

  // Agent-to-agent edges (both endpoints are agent nodes)
  const agentNodeIds = new Set(
    agentNodes.map((n) => n.id),
  )
  const agentEdges = edges.filter(
    (e) =>
      agentNodeIds.has(e.source) &&
      agentNodeIds.has(e.target),
  )

  // Connector-to-agent edges (source is connector, target is agent)
  const connectorNodeIds = new Set(
    connectorNodes.map((n) => n.id),
  )
  const dataEdges = edges.filter(
    (e) =>
      connectorNodeIds.has(e.source) &&
      agentNodeIds.has(e.target),
  )

  return {
    agents: agentNodes.map((node) => {
      const d = node.data

      // Leader = the agent node that has an agent-to-agent edge pointing to this node
      const leaderEdge = agentEdges.find(
        (e) => e.target === node.id,
      )
      const leader = leaderEdge
        ? agentNodes.find(
            (n) => n.id === leaderEdge.source,
          )?.data.agentId || null
        : null

      // Sub-agents = agent nodes this node points to (agent-to-agent only)
      const subAgentEdges = agentEdges.filter(
        (e) => e.source === node.id,
      )
      const subAgents = subAgentEdges
        .map(
          (e) =>
            agentNodes.find(
              (n) => n.id === e.target,
            )?.data.agentId,
        )
        .filter(Boolean) as string[]

      // Team members = siblings (same leader, excluding self)
      const teamMembers = leader
        ? agentEdges
            .filter(
              (e) =>
                e.source === leaderEdge!.source &&
                e.target !== node.id,
            )
            .map(
              (e) =>
                agentNodes.find(
                  (n) => n.id === e.target,
                )?.data.agentId,
            )
            .filter(Boolean)
        : undefined

      return {
        agent_id: d.agentId,
        deployment: d.deployment,
        leader,
        ...(teamMembers && teamMembers.length > 0
          ? { team_members: teamMembers }
          : {}),
        sub_agents: subAgents,
        kwargs: d.kwargs,
        agent_config: {
          llm_config: {
            model_type:
              d.agentConfig.llmConfig.modelType,
            model_name:
              d.agentConfig.llmConfig.modelName,
            endpoint:
              d.agentConfig.llmConfig.endpoint,
            api_version:
              d.agentConfig.llmConfig.apiVersion,
          },
          reasoning_config: {
            reasoning_name:
              d.agentConfig.reasoningConfig
                .reasoningName,
          },
          tool_config: {
            tools_list:
              d.agentConfig.toolConfig.toolsList,
          },
        },
      }
    }),

    connectors: connectorNodes.map((node) => {
      const d = node.data
      return {
        connector_id: d.connectorId,
        name: d.name,
        protocol: d.protocol,
        kafka_config: {
          brokers: d.kafkaConfig.brokers,
          topic: d.kafkaConfig.topic,
          group_id: d.kafkaConfig.groupId,
        },
        dis_config: {
          multicast_address:
            d.disConfig.multicastAddress,
          port: d.disConfig.port,
          exercise_id: d.disConfig.exerciseId,
          entity_types: d.disConfig.entityTypes,
        },
        uci_config: {
          host: d.uciConfig.host,
          port: d.uciConfig.port,
        },
      }
    }),

    data_edges: dataEdges.map((e) => ({
      source_connector:
        connectorNodes.find(
          (n) => n.id === e.source,
        )?.data.connectorId || e.source,
      target_agent:
        agentNodes.find((n) => n.id === e.target)
          ?.data.agentId || e.target,
    })),
  }
}

// ---- Store ----

export const useFlowStore = create<FlowState & FlowActions>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      universalSettings: defaultUniversalSettings,
      champHost: process.env.NEXT_PUBLIC_CHAMP_HOST || '',
      llmConfiguredAt: null,
      champConfiguredAt: null,
      configPanelOpen: false,
      settingsPanelOpen: false,

      onNodesChange: (changes) =>
        set({
          nodes: applyNodeChanges(
            changes,
            get().nodes,
          ) as AppNode[],
        }),

      onEdgesChange: (changes) =>
        set({
          edges: applyEdgeChanges(changes, get().edges),
        }),

      onConnect: (connection) =>
        set({
          edges: addEdge(connection, get().edges),
        }),

      addNode: (node) =>
        set({ nodes: [...get().nodes, node] }),

      updateNodeData: (id, data) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === id
              ? ({
                  ...n,
                  data: { ...n.data, ...data },
                } as AppNode)
              : n,
          ),
        }),

      removeEdge: (id) =>
        set({
          edges: get().edges.filter((e) => e.id !== id),
        }),

      updateEdgeData: (id, data) =>
        set({
          edges: get().edges.map((e) =>
            e.id === id
              ? { ...e, data: { ...e.data, ...data } }
              : e,
          ),
        }),

      removeNode: (id) =>
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter(
            (e) => e.source !== id && e.target !== id,
          ),
          selectedNodeId:
            get().selectedNodeId === id
              ? null
              : get().selectedNodeId,
          configPanelOpen:
            get().selectedNodeId === id
              ? false
              : get().configPanelOpen,
        }),

      setSelectedNode: (id) =>
        set({
          selectedNodeId: id,
          configPanelOpen: id !== null,
          settingsPanelOpen:
            id !== null
              ? false
              : get().settingsPanelOpen,
        }),

      openConfigPanel: () =>
        set({
          configPanelOpen: true,
          settingsPanelOpen: false,
        }),
      closeConfigPanel: () =>
        set({ configPanelOpen: false }),
      toggleSettingsPanel: () => {
        const opening = !get().settingsPanelOpen
        set({
          settingsPanelOpen: opening,
          ...(opening
            ? {
                configPanelOpen: false,
                selectedNodeId: null,
              }
            : {}),
        })
      },

      updateUniversalSettings: (settings) =>
        set({
          universalSettings: {
            ...get().universalSettings,
            ...settings,
          },
          llmConfiguredAt: null,
        }),

      setChampHost: (host) =>
        set({ champHost: host, champConfiguredAt: null }),

      configureLlm: () =>
        set({
          llmConfiguredAt: new Date().toISOString(),
        }),

      configureChamp: () =>
        set({
          champConfiguredAt: new Date().toISOString(),
        }),

      setNodeStatus: (id, status) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === id
              ? ({
                  ...n,
                  data: { ...n.data, status },
                } as AppNode)
              : n,
          ),
        }),

      clearFlow: () =>
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          configPanelOpen: false,
        }),
    }),
    {
      name: 'champ-flow-storage',
      partialize: (state) => ({
        universalSettings: state.universalSettings,
        champHost: state.champHost,
      }),
    },
  ),
)

registerStore('flow', useFlowStore)
