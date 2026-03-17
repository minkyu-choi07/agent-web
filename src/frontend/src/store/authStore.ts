import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerStore } from '@/store/storeRegistry'
import { useFlowStore } from '@/store/flowStore'

export type User = {
  user_id: string
  email: string
  name: string
  workspace: string
}

type AuthState = {
  token: string | null
  user: User | null
  loading: boolean
  error: string | null

  signup: (
    email: string,
    password: string,
    name: string,
  ) => Promise<boolean>
  login: (
    email: string,
    password: string,
  ) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<boolean>
}

async function authCall(
  path: string,
  body?: unknown,
  token?: string,
) {
  const host = useFlowStore.getState().champHost
  if (!host) throw new Error('Champ host not configured')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const proxyBody: Record<string, unknown> = {
    host,
    path,
    method: body ? 'POST' : 'GET',
  }
  if (body) proxyBody.body = body
  if (token) proxyBody.headers = { Authorization: `Bearer ${token}` }

  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers,
    body: JSON.stringify(proxyBody),
  })
  return res.json()
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      loading: false,
      error: null,

      signup: async (email, password, name) => {
        set({ loading: true, error: null })
        try {
          const data = await authCall('/auth/signup', {
            email,
            password,
            name,
          })
          if (data.status === 'success') {
            set({
              token: data.token,
              user: data.user,
              loading: false,
            })
            return true
          }
          set({
            error: data.message || 'Signup failed',
            loading: false,
          })
          return false
        } catch (err) {
          set({
            error:
              err instanceof Error
                ? err.message
                : 'Network error',
            loading: false,
          })
          return false
        }
      },

      login: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const data = await authCall('/auth/login', {
            email,
            password,
          })
          if (data.status === 'success') {
            set({
              token: data.token,
              user: data.user,
              loading: false,
            })
            return true
          }
          set({
            error: data.message || 'Login failed',
            loading: false,
          })
          return false
        } catch (err) {
          set({
            error:
              err instanceof Error
                ? err.message
                : 'Network error',
            loading: false,
          })
          return false
        }
      },

      logout: () => {
        set({ token: null, user: null, error: null })
      },

      checkAuth: async () => {
        const { token } = get()
        if (!token) return false
        set({ loading: true })
        try {
          const data = await authCall(
            '/auth/me',
            undefined,
            token,
          )
          if (data.status === 'success') {
            set({ user: data.user, loading: false })
            return true
          }
          set({
            token: null,
            user: null,
            loading: false,
          })
          return false
        } catch {
          set({ loading: false })
          return false
        }
      },
    }),
    {
      name: 'champ-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    },
  ),
)

registerStore('auth', useAuthStore)
