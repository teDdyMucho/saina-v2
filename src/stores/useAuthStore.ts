import { create } from 'zustand'

export type UserRole = 'admin' | 'employee'

interface User {
  id: string
  name: string
  email: string
  role: UserRole
  orgId: string
  avatar?: string
  phone?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (identifier: string, role: UserRole, nameOverride?: string, remember?: boolean) => void
  logout: () => void
  updateUser: (partial: Partial<Pick<User, 'name' | 'email' | 'avatar' | 'phone'>>) => void
}

export const useAuthStore = create<AuthState>((set) => {
  let initialUser: User | null = null
  try {
    const saved = localStorage.getItem('authUser') ?? sessionStorage.getItem('authUser')
    if (saved) initialUser = JSON.parse(saved) as User
  } catch {}

  return {
    user: initialUser,
    isAuthenticated: !!initialUser,
    login: (identifier: string, role: UserRole, nameOverride?: string, remember: boolean = false) => {
      const user: User = {
        id: '1',
        name: nameOverride || (role === 'admin' ? 'Admin User' : 'John Doe'),
        email: identifier,
        role,
        orgId: 'org-1',
        avatar: undefined,
        phone: undefined,
      }

      // Persist based on remember flag
      try {
        const key = 'authUser'
        const data = JSON.stringify(user)
        if (remember) {
          localStorage.setItem(key, data)
          sessionStorage.removeItem(key)
        } else {
          sessionStorage.setItem(key, data)
          localStorage.removeItem(key)
        }
      } catch {}

      set({ user, isAuthenticated: true })
    },
    logout: () => {
      try {
        localStorage.removeItem('authUser')
        sessionStorage.removeItem('authUser')
      } catch {}
      set({ user: null, isAuthenticated: false })
    },
    updateUser: (partial) => {
      set((state) => {
        const next = state.user ? { ...state.user, ...partial } : null
        try {
          const key = 'authUser'
          if (next) {
            // Persist to the storage where it currently lives
            if (localStorage.getItem(key)) {
              localStorage.setItem(key, JSON.stringify(next))
            } else {
              sessionStorage.setItem(key, JSON.stringify(next))
            }
          }
        } catch {}
        return { user: next }
      })
    },
  }
})
