import { useEffect, useState } from 'react'
import { LocalStore } from '../stores/LocalStore'
import { ApiStore } from '../stores/ApiStore'
import type { JournalStore } from '../stores/JournalStore'

const localStoreSingleton = new LocalStore()
const apiStoreSingleton = new ApiStore()

export interface StoreState {
  store: JournalStore
  isAuthenticated: boolean
  userEmail: string | null
  loading: boolean
}

export function useStore(): StoreState {
  const [state, setState] = useState<StoreState>({
    store: localStoreSingleton,
    isAuthenticated: false,
    userEmail: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const user = (await res.json()) as { email: string }
          setState({
            store: apiStoreSingleton,
            isAuthenticated: true,
            userEmail: user.email,
            loading: false,
          })
        } else {
          setState({
            store: localStoreSingleton,
            isAuthenticated: false,
            userEmail: null,
            loading: false,
          })
        }
      } catch {
        if (cancelled) return
        setState({
          store: localStoreSingleton,
          isAuthenticated: false,
          userEmail: null,
          loading: false,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function getLocalStore(): LocalStore {
  return localStoreSingleton
}

export function getApiStore(): ApiStore {
  return apiStoreSingleton
}
