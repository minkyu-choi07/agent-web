'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const router = useRouter()
  const { login, signup, loading, error } = useAuthStore()
  const token = useAuthStore((s) => s.token)

  // Redirect to home if already authenticated
  useEffect(() => {
    async function check() {
      const state = useAuthStore.getState()
      if (!state.token) return
      const valid = await state.checkAuth()
      if (valid) router.replace('/')
    }
    if (useAuthStore.persist.hasHydrated()) {
      check()
    } else {
      const unsub =
        useAuthStore.persist.onFinishHydration(() => {
          check()
        })
      return unsub
    }
  }, [token, router])

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    let ok: boolean
    if (mode === 'signup') {
      ok = await signup(email, password, name)
    } else {
      ok = await login(email, password)
    }
    if (ok) {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="panel w-full max-w-sm p-8">
        {/* Logo */}
        <h1
          className="text-2xl font-bold text-hud-accent tracking-widest uppercase text-center mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          CHAMP
        </h1>
        <p
          className="text-[11px] text-hud-text-dim text-center tracking-wider uppercase mb-8"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Multi-Agent Flow Editor
        </p>

        {/* Tab toggle */}
        <div className="flex mb-6 border border-hud-border">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-[11px] font-medium tracking-wider uppercase transition-all ${
                mode === m
                  ? 'bg-hud-accent/10 text-hud-accent border-b-2 border-hud-accent'
                  : 'text-hud-text-dim hover:text-hud-text'
              }`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input-field"
              placeholder="operator@champ.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>

          {error && (
            <div className="text-[11px] text-[var(--clr-warning)] bg-[var(--clr-warning-dim)] border border-[rgba(255,107,61,0.15)] px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading
              ? 'Authenticating...'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
