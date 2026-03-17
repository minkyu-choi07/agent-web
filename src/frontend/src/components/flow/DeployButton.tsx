'use client'

import { useCallback, useState } from 'react'
import {
  Rocket,
  Loader2,
  Radio,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useDeployStore,
  type DeployStatus,
} from '@/store/deployStore'

const statusConfig: Record<
  DeployStatus,
  {
    label: string
    icon: typeof Rocket
    className: string
  }
> = {
  idle: {
    label: 'DEPLOY',
    icon: Rocket,
    className:
      'border-hud-accent/40 text-hud-accent hover:bg-hud-accent hover:text-hud-bg',
  },
  deploying: {
    label: 'DEPLOYING',
    icon: Loader2,
    className:
      'border-hud-accent/40 text-hud-accent cursor-wait',
  },
  deployed: {
    label: 'LIVE',
    icon: Radio,
    className:
      'bg-hud-accent text-hud-bg border-hud-accent shadow-glow-accent-sm hover:bg-hud-warning hover:border-hud-warning hover:shadow-glow-warning',
  },
  tearing_down: {
    label: 'STOPPING',
    icon: Loader2,
    className:
      'border-hud-warning/40 text-hud-warning cursor-wait',
  },
  error: {
    label: 'ERROR',
    icon: XCircle,
    className:
      'border-hud-warning text-hud-warning hover:bg-hud-warning hover:text-hud-bg',
  },
}

export function DeployButton() {
  const status = useDeployStore((s) => s.status)
  const error = useDeployStore((s) => s.error)
  const deployFlow = useDeployStore(
    (s) => s.deployFlow,
  )
  const teardownFlow = useDeployStore(
    (s) => s.teardownFlow,
  )
  const reset = useDeployStore((s) => s.reset)
  const [showConfirm, setShowConfirm] = useState(false)

  const config = statusConfig[status]
  const Icon = config.icon

  const handleClick = useCallback(() => {
    if (status === 'idle' || status === 'error') {
      if (status === 'error') reset()
      deployFlow()
    } else if (status === 'deployed') {
      if (showConfirm) {
        setShowConfirm(false)
        teardownFlow()
      } else {
        setShowConfirm(true)
        setTimeout(() => setShowConfirm(false), 3000)
      }
    }
  }, [
    status,
    showConfirm,
    deployFlow,
    teardownFlow,
    reset,
  ])

  return (
    <button
      onClick={handleClick}
      disabled={
        status === 'deploying' ||
        status === 'tearing_down'
      }
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-semibold tracking-wider uppercase transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        config.className,
      )}
      style={{ fontFamily: 'var(--font-display)' }}
      title={
        error
          ? `Error: ${error}`
          : showConfirm
            ? 'Click again to teardown'
            : undefined
      }
    >
      <Icon
        className={cn(
          'w-3.5 h-3.5',
          status === 'deploying' ||
            status === 'tearing_down'
            ? 'animate-spin'
            : '',
        )}
      />
      <span>
        {showConfirm ? 'TEARDOWN?' : config.label}
      </span>
    </button>
  )
}
