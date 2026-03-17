import { create } from 'zustand'
import {
  streamChat,
  streamChatWithFile,
  type SSEEvent,
} from '@/lib/champApi'
import { registerStore } from '@/store/storeRegistry'
import { useFlowStore } from '@/store/flowStore'
import { useMissionStore } from '@/store/missionStore'

// ── Types ────────────────────────────────────────────────────────

export type ToolCallEvent = {
  tool: string
  args: Record<string, unknown>
}

export type ToolResultEvent = {
  tool: string
  result: string
}

export type FileAttachment = {
  name: string
  size: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  status: 'complete' | 'streaming' | 'error'
  timestamp: number
  toolCalls: ToolCallEvent[]
  toolResults: ToolResultEvent[]
  file?: FileAttachment
  isInterAgentMessage?: boolean
  sourceAgentId?: string
  targetAgentId?: string
}

type ChatState = {
  conversations: Record<string, ChatMessage[]>
  activeAgentId: string | null
  isStreaming: boolean
  chatDrawerOpen: boolean
  chatDrawerHeight: number
  activeController: AbortController | null
  pendingFile: File | null
}

type ChatActions = {
  openChat: (agentId: string) => void
  closeChat: () => void
  setActiveAgent: (agentId: string) => void
  sendMessage: (
    agentId: string,
    message: string,
  ) => void
  sendMessageWithFile: (
    agentId: string,
    message: string,
    file: File,
  ) => void
  setPendingFile: (file: File | null) => void
  cancelStream: () => void
  clearConversation: (agentId: string) => void
  setChatDrawerHeight: (height: number) => void
}

// ── Helpers ──────────────────────────────────────────────────────

let msgCounter = 0
function nextId() {
  return `msg-${Date.now()}-${msgCounter++}`
}

function getConversation(
  state: ChatState,
  agentId: string,
): ChatMessage[] {
  return state.conversations[agentId] || []
}

function updateConversation(
  state: ChatState,
  agentId: string,
  updater: (msgs: ChatMessage[]) => ChatMessage[],
): Partial<ChatState> {
  return {
    conversations: {
      ...state.conversations,
      [agentId]: updater(
        getConversation(state, agentId),
      ),
    },
  }
}

function updateLastAgentMessage(
  state: ChatState,
  agentId: string,
  updater: (msg: ChatMessage) => ChatMessage,
): Partial<ChatState> {
  return updateConversation(state, agentId, (msgs) => {
    const lastIdx = msgs.findLastIndex(
      (m) => m.role === 'agent' && m.status === 'streaming',
    )
    if (lastIdx === -1) return msgs
    const updated = [...msgs]
    updated[lastIdx] = updater(updated[lastIdx])
    return updated
  })
}

// ── Store ────────────────────────────────────────────────────────

export const useChatStore = create<
  ChatState & ChatActions
>((set, get) => ({
  conversations: {},
  activeAgentId: null,
  isStreaming: false,
  chatDrawerOpen: false,
  chatDrawerHeight: 320,
  activeController: null,
  pendingFile: null,

  setPendingFile: (file) => set({ pendingFile: file }),

  openChat: (agentId) =>
    set({
      chatDrawerOpen: true,
      activeAgentId: agentId,
    }),

  closeChat: () => {
    get().cancelStream()
    set({ chatDrawerOpen: false })
  },

  setActiveAgent: (agentId) =>
    set({ activeAgentId: agentId }),

  setChatDrawerHeight: (height) =>
    set({ chatDrawerHeight: height }),

  cancelStream: () => {
    const { activeController } = get()
    if (activeController) {
      activeController.abort()
      set({ activeController: null, isStreaming: false })
    }
  },

  clearConversation: (agentId) =>
    set((s) => ({
      conversations: {
        ...s.conversations,
        [agentId]: [],
      },
    })),

  sendMessage: (agentId, message) => {
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: message,
      status: 'complete',
      timestamp: Date.now(),
      toolCalls: [],
      toolResults: [],
    }

    const agentMsg: ChatMessage = {
      id: nextId(),
      role: 'agent',
      content: '',
      status: 'streaming',
      timestamp: Date.now(),
      toolCalls: [],
      toolResults: [],
    }

    set((s) => ({
      ...updateConversation(s, agentId, (msgs) => [
        ...msgs,
        userMsg,
        agentMsg,
      ]),
      isStreaming: true,
    }))

    const controller = streamChat(
      agentId,
      message,
      // onEvent
      (event: SSEEvent) => {
        switch (event.event) {
          case 'status':
            // Update streaming message with status hint
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  content:
                    msg.content ||
                    (event.data.status === 'thinking'
                      ? ''
                      : ''),
                }),
              ),
            )
            break

          case 'delta':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  content:
                    msg.content +
                    (event.data.text as string),
                }),
              ),
            )
            break

          case 'tool_call': {
            const toolCall: ToolCallEvent = {
              tool: event.data.tool as string,
              args: event.data.args as Record<
                string,
                unknown
              >,
            }
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  toolCalls: [
                    ...msg.toolCalls,
                    toolCall,
                  ],
                }),
              ),
            )

            // Inter-agent message detection
            if (
              toolCall.tool === 'send_agent_message'
            ) {
              const targetId = toolCall.args
                .target_agent_id as string
              const content = toolCall.args
                .message as string
              if (targetId && content) {
                // Inject system message in target agent's chat
                const sysMsg: ChatMessage = {
                  id: nextId(),
                  role: 'system',
                  content,
                  status: 'complete',
                  timestamp: Date.now(),
                  toolCalls: [],
                  toolResults: [],
                  isInterAgentMessage: true,
                  sourceAgentId: agentId,
                  targetAgentId: targetId,
                }
                set((s) =>
                  updateConversation(
                    s,
                    targetId,
                    (msgs) => [...msgs, sysMsg],
                  ),
                )

                // Trigger edge animation
                const flowStore = useFlowStore.getState()
                const edges = flowStore.edges
                const nodes = flowStore.nodes
                const sourceNode = nodes.find(
                  (n) =>
                    n.type === 'agent' &&
                    n.data &&
                    'agentId' in n.data &&
                    n.data.agentId === agentId,
                )
                const targetNode = nodes.find(
                  (n) =>
                    n.type === 'agent' &&
                    n.data &&
                    'agentId' in n.data &&
                    n.data.agentId === targetId,
                )
                if (sourceNode && targetNode) {
                  const edge = edges.find(
                    (e) =>
                      e.source === sourceNode.id &&
                      e.target === targetNode.id,
                  )
                  if (edge) {
                    flowStore.updateEdgeData(edge.id, {
                      isAnimating: true,
                    })
                    setTimeout(() => {
                      flowStore.updateEdgeData(edge.id, {
                        isAnimating: false,
                      })
                    }, 2000)
                  }
                }
              }
            }

            // Map overlay tool detection
            if (
              toolCall.tool === 'update_map_overlay'
            ) {
              const missionStore =
                useMissionStore.getState()
              const entities = toolCall.args
                .entities as Array<{
                type: string
                name: string
                affiliation: string
                geometry: GeoJSON.Geometry
                properties: Record<string, unknown>
                visible?: boolean
                color?: string
              }>
              if (entities && Array.isArray(entities)) {
                missionStore.addEntities(
                  entities.map((e) => ({
                    type: e.type as import('@/store/missionStore').MapEntityType,
                    name: e.name || 'Unnamed',
                    affiliation: (e.affiliation ||
                      'unknown') as import('@/store/missionStore').ForceAffiliation,
                    geometry: e.geometry,
                    properties: e.properties || {},
                    visible: e.visible !== false,
                    color: e.color || '',
                    createdBy: 'agent' as const,
                    agentSourceId: agentId,
                  })),
                )
              }
              const viewport = toolCall.args
                .viewport as
                | Record<string, number>
                | undefined
              if (viewport) {
                missionStore.setViewport(viewport)
              }
            }
            break
          }

          case 'tool_result':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  toolResults: [
                    ...msg.toolResults,
                    {
                      tool: event.data.tool as string,
                      result: event.data
                        .result as string,
                    },
                  ],
                }),
              ),
            )
            break

          case 'done':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  status: 'complete' as const,
                  content:
                    (event.data
                      .full_response as string) ||
                    msg.content,
                }),
              ),
            )
            break

          case 'error':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  status: 'error' as const,
                  content:
                    event.data.message as string,
                }),
              ),
            )
            break
        }
      },
      // onError
      (error: Error) => {
        set((s) => ({
          ...updateLastAgentMessage(
            s,
            agentId,
            (msg) => ({
              ...msg,
              status: 'error' as const,
              content: error.message,
            }),
          ),
          isStreaming: false,
          activeController: null,
        }))
      },
      // onDone
      () => {
        set({ isStreaming: false, activeController: null })
      },
    )

    set({ activeController: controller })
  },

  sendMessageWithFile: (agentId, message, file) => {
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: message || `Uploaded file: ${file.name}`,
      status: 'complete',
      timestamp: Date.now(),
      toolCalls: [],
      toolResults: [],
      file: { name: file.name, size: file.size },
    }

    const agentMsg: ChatMessage = {
      id: nextId(),
      role: 'agent',
      content: '',
      status: 'streaming',
      timestamp: Date.now(),
      toolCalls: [],
      toolResults: [],
    }

    set((s) => ({
      ...updateConversation(s, agentId, (msgs) => [
        ...msgs,
        userMsg,
        agentMsg,
      ]),
      isStreaming: true,
    }))

    const controller = streamChatWithFile(
      agentId,
      message,
      file,
      // onEvent — reuse same handler as sendMessage
      (event: SSEEvent) => {
        switch (event.event) {
          case 'status':
            break
          case 'delta':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  content:
                    msg.content +
                    (event.data.text as string),
                }),
              ),
            )
            break
          case 'tool_call':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  toolCalls: [
                    ...msg.toolCalls,
                    {
                      tool: event.data
                        .tool as string,
                      args: event.data.args as Record<
                        string,
                        unknown
                      >,
                    },
                  ],
                }),
              ),
            )
            break
          case 'tool_result':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  toolResults: [
                    ...msg.toolResults,
                    {
                      tool: event.data
                        .tool as string,
                      result: event.data
                        .result as string,
                    },
                  ],
                }),
              ),
            )
            break
          case 'done':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  status: 'complete' as const,
                  content:
                    (event.data
                      .full_response as string) ||
                    msg.content,
                }),
              ),
            )
            break
          case 'error':
            set((s) =>
              updateLastAgentMessage(
                s,
                agentId,
                (msg) => ({
                  ...msg,
                  status: 'error' as const,
                  content:
                    event.data.message as string,
                }),
              ),
            )
            break
        }
      },
      (error: Error) => {
        set((s) => ({
          ...updateLastAgentMessage(
            s,
            agentId,
            (msg) => ({
              ...msg,
              status: 'error' as const,
              content: error.message,
            }),
          ),
          isStreaming: false,
          activeController: null,
        }))
      },
      () => {
        set({
          isStreaming: false,
          activeController: null,
        })
      },
    )

    set({ activeController: controller })
  },
}))

registerStore('chat', useChatStore)
