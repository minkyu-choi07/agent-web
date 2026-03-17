'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FlowEditor } from '@/components/flow/FlowEditor'
import { useAuthStore } from '@/store/authStore'

export default function Home() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function validate() {
      const state = useAuthStore.getState()
      if (!state.token) {
        router.replace('/login')
        return
      }
      // Validate the persisted token with the backend
      const valid = await state.checkAuth()
      if (!valid) {
        router.replace('/login')
      } else {
        setReady(true)
      }
    }

    // Wait for zustand hydration
    const unsub = useAuthStore.persist.onFinishHydration(
      () => {
        validate()
      },
    )
    // If already hydrated
    if (useAuthStore.persist.hasHydrated()) {
      validate()
    }
    return unsub
  }, [token, router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-hud-text-dim text-[11px] tracking-wider uppercase animate-pulse">
          Initializing...
        </div>
      </div>
    )
  }

  return <FlowEditor />
}
