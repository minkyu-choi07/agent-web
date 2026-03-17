'use client'

import { useState, useCallback } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getStraightPath,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { Trash2, Minus, Spline, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFlowStore } from '@/store/flowStore'

export type PathStyle = 'smoothstep' | 'straight' | 'bezier'

const pathOptions: {
  value: PathStyle
  icon: typeof Minus
  label: string
}[] = [
  { value: 'smoothstep', icon: CornerDownRight, label: 'Step' },
  { value: 'bezier', icon: Spline, label: 'Curve' },
  { value: 'straight', icon: Minus, label: 'Line' },
]

function getPath(
  style: PathStyle,
  params: {
    sourceX: number
    sourceY: number
    targetX: number
    targetY: number
    sourcePosition: EdgeProps['sourcePosition']
    targetPosition: EdgeProps['targetPosition']
  },
): [string, number, number, number, number] {
  switch (style) {
    case 'straight':
      return getStraightPath(params)
    case 'bezier':
      return getBezierPath(params)
    case 'smoothstep':
    default:
      return getSmoothStepPath(params)
  }
}

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const removeEdge = useFlowStore((s) => s.removeEdge)
  const updateEdgeData = useFlowStore(
    (s) => s.updateEdgeData,
  )
  const [hovered, setHovered] = useState(false)

  const pathStyle: PathStyle =
    (data?.pathStyle as PathStyle) || 'smoothstep'

  const pathParams = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  }

  const result = getPath(pathStyle, pathParams)
  const edgePath = result[0]
  const labelX = result[1]
  const labelY = result[2]

  const visible = selected || hovered

  const onStyleChange = useCallback(
    (style: PathStyle) => {
      updateEdgeData(id, { pathStyle: style })
    },
    [id, updateEdgeData],
  )

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeEdge(id)
    },
    [id, removeEdge],
  )

  return (
    <>
      {/* Invisible wider path for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        className={
          data?.isAnimating
            ? 'edge-message-pulse'
            : undefined
        }
      />
      <EdgeLabelRenderer>
        <div
          className="edge-toolbar-wrap"
          data-visible={visible || undefined}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="edge-toolbar">
            {/* Path style buttons */}
            {pathOptions.map((opt) => {
              const Icon = opt.icon
              const active = pathStyle === opt.value
              return (
                <button
                  key={opt.value}
                  className={cn(
                    'edge-toolbar-btn',
                    active && 'edge-toolbar-btn-active',
                  )}
                  title={opt.label}
                  onClick={(e) => {
                    e.stopPropagation()
                    onStyleChange(opt.value)
                  }}
                >
                  <Icon className="w-3 h-3" />
                </button>
              )
            })}

            {/* Divider */}
            <div className="edge-toolbar-divider" />

            {/* Delete */}
            <button
              className="edge-toolbar-btn edge-toolbar-btn-delete"
              title="Delete connection"
              onClick={onDelete}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
