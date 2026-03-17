import { create } from 'zustand'
import { anvilApi } from '@/lib/anvilApi'
import {
  useFlowStore,
  serializeFlowToPayload,
  type AgentNode,
  type ConnectorNode,
} from '@/store/flowStore'

// ── Types ────────────────────────────────────────────────────────

export type DeployStatus =
  | 'idle'
  | 'deploying'
  | 'deployed'
  | 'tearing_down'
  | 'error'

export type DeployLogEntry = {
  timestamp: number
  message: string
  level: 'info' | 'error' | 'success'
}

type DeployState = {
  status: DeployStatus
  error: string | null
  deployedAgentIds: string[]
  deployedConnectorIds: string[]
  deployLog: DeployLogEntry[]
}

type DeployActions = {
  deployFlow: () => Promise<void>
  deployAgents: (nodeIds: string[]) => Promise<void>
  teardownFlow: () => Promise<void>
  reset: () => void
}

// ── Helpers ──────────────────────────────────────────────────────

function log(
  set: (fn: (s: DeployState) => Partial<DeployState>) => void,
  message: string,
  level: DeployLogEntry['level'] = 'info',
) {
  set((s) => ({
    deployLog: [
      ...s.deployLog,
      { timestamp: Date.now(), message, level },
    ],
  }))
}

// ── Store ────────────────────────────────────────────────────────

export const useDeployStore = create<
  DeployState & DeployActions
>((set, get) => ({
  status: 'idle',
  error: null,
  deployedAgentIds: [],
  deployedConnectorIds: [],
  deployLog: [],

  deployFlow: async () => {
    const flow = useFlowStore.getState()
    const { nodes, edges, universalSettings, anvilHost } =
      flow

    // Validate prerequisites
    if (!anvilHost) {
      set({
        status: 'error',
        error: 'Anvil host not configured',
      })
      return
    }
    if (!universalSettings.apiKey) {
      set({
        status: 'error',
        error: 'LLM API key not configured',
      })
      return
    }

    const agentNodes = nodes.filter(
      (n): n is AgentNode => n.type === 'agent',
    )
    if (agentNodes.length === 0) {
      set({
        status: 'error',
        error: 'No agents to deploy',
      })
      return
    }

    set({
      status: 'deploying',
      error: null,
      deployLog: [],
      deployedAgentIds: [],
      deployedConnectorIds: [],
    })

    try {
      // Step 1: Configure LLM
      log(set, 'Configuring LLM...')
      await anvilApi.configureLlm({
        provider: universalSettings.provider,
        api_key: universalSettings.apiKey,
        default_model: universalSettings.defaultModel,
      })
      log(
        set,
        `LLM configured: ${universalSettings.provider}/${universalSettings.defaultModel}`,
        'success',
      )

      // Step 2: Create agents
      const payload = serializeFlowToPayload(nodes, edges)

      for (const agentPayload of payload.agents) {
        log(
          set,
          `Deploying agent: ${agentPayload.agent_id}...`,
        )
        await anvilApi.addAgent({
          agent_id: agentPayload.agent_id,
          name:
            agentNodes.find(
              (n) =>
                n.data.agentId === agentPayload.agent_id,
            )?.data.name || agentPayload.agent_id,
          model:
            agentPayload.agent_config.llm_config
              .model_name ||
            universalSettings.defaultModel,
          agent_config: {
            llm_config: agentPayload.agent_config.llm_config,
            reasoning_config:
              agentPayload.agent_config.reasoning_config,
            tool_config:
              agentPayload.agent_config.tool_config,
          },
        })

        set((s) => ({
          deployedAgentIds: [
            ...s.deployedAgentIds,
            agentPayload.agent_id,
          ],
        }))

        // Update node status
        const node = agentNodes.find(
          (n) =>
            n.data.agentId === agentPayload.agent_id,
        )
        if (node) {
          flow.setNodeStatus(node.id, 'running')
        }

        log(
          set,
          `Agent deployed: ${agentPayload.agent_id}`,
          'success',
        )
      }

      // Step 3: Start connectors
      const connectorNodes = nodes.filter(
        (n): n is ConnectorNode =>
          n.type === 'connector',
      )

      for (const connPayload of payload.connectors) {
        log(
          set,
          `Starting connector: ${connPayload.name}...`,
        )

        const connNode = connectorNodes.find(
          (n) =>
            n.data.connectorId ===
            connPayload.connector_id,
        )
        const protocol = connNode?.data.protocol || 'zmq'

        const startPayload: Record<string, unknown> = {
          connector_id: connPayload.connector_id,
          name: connPayload.name,
          protocol,
        }

        if (protocol === 'kafka') {
          startPayload.kafka_config =
            connPayload.kafka_config
        } else if (protocol === 'dis') {
          startPayload.dis_config =
            connPayload.dis_config
        } else if (protocol === 'uci') {
          startPayload.uci_config =
            connPayload.uci_config
        } else {
          // zmq — build from connNode data
          startPayload.zmq_config = connNode
            ? {
                endpoint: connNode.data.zmqConfig.endpoint,
                topic: connNode.data.zmqConfig.topic,
              }
            : undefined
        }

        await anvilApi.startConnector(
          startPayload as Parameters<
            typeof anvilApi.startConnector
          >[0],
        )

        set((s) => ({
          deployedConnectorIds: [
            ...s.deployedConnectorIds,
            connPayload.connector_id,
          ],
        }))

        if (connNode) {
          flow.setNodeStatus(connNode.id, 'connected')
        }

        log(
          set,
          `Connector started: ${connPayload.name} (${protocol})`,
          'success',
        )
      }

      // Step 4: Sync edges
      if (payload.data_edges.length > 0) {
        log(
          set,
          `Syncing ${payload.data_edges.length} data edge(s)...`,
        )
        await anvilApi.syncEdges(payload.data_edges)
        log(
          set,
          `Synced ${payload.data_edges.length} data edge(s)`,
          'success',
        )
      }

      // Done
      set({ status: 'deployed' })
      log(set, 'Deployment complete', 'success')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err)
      set({ status: 'error', error: message })
      log(set, `Deploy failed: ${message}`, 'error')
    }
  },

  deployAgents: async (nodeIds: string[]) => {
    const flow = useFlowStore.getState()
    const {
      nodes,
      edges,
      universalSettings,
      anvilHost,
    } = flow
    const { deployedAgentIds, deployedConnectorIds } =
      get()

    if (!anvilHost) {
      set({
        status: 'error',
        error: 'Anvil host not configured',
      })
      return
    }
    if (!universalSettings.apiKey) {
      set({
        status: 'error',
        error: 'LLM API key not configured',
      })
      return
    }

    const targetAgentNodes = nodes.filter(
      (n): n is AgentNode =>
        n.type === 'agent' && nodeIds.includes(n.id),
    )
    if (targetAgentNodes.length === 0) return

    const prevStatus = get().status
    set({ status: 'deploying', error: null })

    try {
      // Ensure LLM is configured
      log(set, 'Configuring LLM...')
      await anvilApi.configureLlm({
        provider: universalSettings.provider,
        api_key: universalSettings.apiKey,
        default_model: universalSettings.defaultModel,
      })

      // Deploy each agent
      const payload = serializeFlowToPayload(
        nodes,
        edges,
      )

      for (const agentNode of targetAgentNodes) {
        const agentId = agentNode.data.agentId
        if (deployedAgentIds.includes(agentId)) {
          log(
            set,
            `Agent ${agentId} already deployed, skipping`,
            'info',
          )
          continue
        }

        const agentPayload = payload.agents.find(
          (a) => a.agent_id === agentId,
        )
        if (!agentPayload) continue

        log(
          set,
          `Deploying agent: ${agentNode.data.name}...`,
        )
        await anvilApi.addAgent({
          agent_id: agentPayload.agent_id,
          name: agentNode.data.name,
          model:
            agentPayload.agent_config.llm_config
              .model_name ||
            universalSettings.defaultModel,
          agent_config: {
            llm_config:
              agentPayload.agent_config.llm_config,
            reasoning_config:
              agentPayload.agent_config
                .reasoning_config,
            tool_config:
              agentPayload.agent_config.tool_config,
          },
        })

        set((s) => ({
          deployedAgentIds: [
            ...s.deployedAgentIds,
            agentId,
          ],
        }))
        flow.setNodeStatus(agentNode.id, 'running')
        log(
          set,
          `Agent deployed: ${agentNode.data.name}`,
          'success',
        )
      }

      // Deploy connected connectors that aren't already running
      const connectorNodes = nodes.filter(
        (n): n is ConnectorNode =>
          n.type === 'connector',
      )
      const targetAgentIds = new Set(
        targetAgentNodes.map((n) => n.data.agentId),
      )
      const neededConnEdges = payload.data_edges.filter(
        (e) => targetAgentIds.has(e.target_agent),
      )
      const neededConnIds = new Set(
        neededConnEdges.map((e) => e.source_connector),
      )

      for (const connPayload of payload.connectors) {
        if (
          !neededConnIds.has(
            connPayload.connector_id,
          )
        )
          continue
        if (
          deployedConnectorIds.includes(
            connPayload.connector_id,
          )
        )
          continue

        const connNode = connectorNodes.find(
          (n) =>
            n.data.connectorId ===
            connPayload.connector_id,
        )
        const protocol =
          connNode?.data.protocol || 'zmq'

        const startPayload: Record<string, unknown> = {
          connector_id: connPayload.connector_id,
          name: connPayload.name,
          protocol,
        }

        if (protocol === 'kafka') {
          startPayload.kafka_config =
            connPayload.kafka_config
        } else if (protocol === 'dis') {
          startPayload.dis_config =
            connPayload.dis_config
        } else if (protocol === 'uci') {
          startPayload.uci_config =
            connPayload.uci_config
        } else {
          startPayload.zmq_config = connNode
            ? {
                endpoint:
                  connNode.data.zmqConfig.endpoint,
                topic:
                  connNode.data.zmqConfig.topic,
              }
            : undefined
        }

        log(
          set,
          `Starting connector: ${connPayload.name}...`,
        )
        await anvilApi.startConnector(
          startPayload as Parameters<
            typeof anvilApi.startConnector
          >[0],
        )

        set((s) => ({
          deployedConnectorIds: [
            ...s.deployedConnectorIds,
            connPayload.connector_id,
          ],
        }))
        if (connNode)
          flow.setNodeStatus(
            connNode.id,
            'connected',
          )
        log(
          set,
          `Connector started: ${connPayload.name}`,
          'success',
        )
      }

      // Sync all current edges
      const allEdges = payload.data_edges
      if (allEdges.length > 0) {
        await anvilApi.syncEdges(allEdges)
        log(
          set,
          `Synced ${allEdges.length} edge(s)`,
          'success',
        )
      }

      set({ status: 'deployed' })
      log(set, 'Selective deploy complete', 'success')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err)
      set({
        status:
          prevStatus === 'deployed'
            ? 'deployed'
            : 'error',
        error: message,
      })
      log(set, `Deploy failed: ${message}`, 'error')
    }
  },

  teardownFlow: async () => {
    const flow = useFlowStore.getState()
    set({ status: 'tearing_down', error: null })

    try {
      log(set, 'Tearing down...')

      // Decommission all agents
      await anvilApi.decommissionAll()
      log(set, 'All agents decommissioned', 'success')

      // Stop all connectors
      const { deployedConnectorIds } = get()
      for (const cid of deployedConnectorIds) {
        try {
          await anvilApi.stopConnector(cid)
        } catch {
          // connector may already be stopped
        }
      }
      log(set, 'All connectors stopped', 'success')

      // Reset node statuses
      for (const node of flow.nodes) {
        if (node.type === 'agent') {
          flow.setNodeStatus(node.id, 'idle')
        } else if (node.type === 'connector') {
          flow.setNodeStatus(node.id, 'idle')
        }
      }

      set({
        status: 'idle',
        deployedAgentIds: [],
        deployedConnectorIds: [],
      })
      log(set, 'Teardown complete', 'success')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err)
      set({ status: 'error', error: message })
      log(set, `Teardown failed: ${message}`, 'error')
    }
  },

  reset: () =>
    set({
      status: 'idle',
      error: null,
      deployedAgentIds: [],
      deployedConnectorIds: [],
      deployLog: [],
    }),
}))
