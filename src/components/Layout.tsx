import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button } from './ui/button'
import { useAuthStore } from '@/stores/useAuthStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Settings,
  LogOut,
  Home,
  Clock,
  Moon,
  Sun,
  Menu,
  X,
  Timer,
  ChevronRight,
  Bell,
  User,
  UserPlus,
} from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // Helpers
  const initials = useMemo(() => {
    const n = user?.name || 'User'
    const parts = n.trim().split(' ')
    const first = parts[0]?.[0] ?? 'U'
    const second = parts[1]?.[0] ?? ''
    return (first + second).toUpperCase()
  }, [user?.name])

  // Load avatar from Supabase `user.profile`
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        if (!user?.name) { setAvatarUrl(null); return }
        const { data } = await supabase
          .from('user')
          .select('profile')
          .eq('name', user.name)
          .maybeSingle()
        setAvatarUrl((data as any)?.profile || null)
      } catch {
        setAvatarUrl(null)
      }
    }
    loadAvatar()
  }, [user?.name])

  // Next shift ETA derived from Supabase schedule/template
  const [nextShiftIn, setNextShiftIn] = useState<string>('—')

  useEffect(() => {
    const to24h = (s?: string): string => {
      if (!s) return ''
      const str = String(s).trim().toLowerCase()
      if (/^\d{2}:\d{2}$/.test(str)) return str
      const m = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/)
      if (!m) return ''
      let h = parseInt(m[1], 10)
      const min = m[2]
      const ap = m[3]
      if (ap) {
        if (ap === 'pm' && h !== 12) h += 12
        if (ap === 'am' && h === 12) h = 0
      }
      return `${String(h).padStart(2, '0')}:${min}`
    }

    const parseDaysToIndices = (days: any): number[] => {
      if (!days) return []
      try {
        const parsed = typeof days === 'string' ? JSON.parse(days) : days
        if (Array.isArray(parsed)) {
          return parsed
            .map((d) => {
              const name = String(d).slice(0, 3).toLowerCase()
              return ['sun','mon','tue','wed','thu','fri','sat'].indexOf(name)
            })
            .filter((i) => i >= 0)
        }
      } catch {
        const parts = String(days).split(',').map((s) => s.trim().slice(0,3).toLowerCase())
        return parts.map((p) => ['sun','mon','tue','wed','thu','fri','sat'].indexOf(p)).filter((i) => i >= 0)
      }
      return []
    }

    const compute = async () => {
      try {
        if (!user) { setNextShiftIn('—'); return }
        let username = user.email
        const fullName = user.name
        const now = new Date()
        const YYYYMMDD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        const todayStr = YYYYMMDD(now)

        // Resolve actual user_name from user table if available
        try {
          const { data: profile } = await supabase
            .from('user')
            .select('user_name')
            .eq('name', fullName)
            .maybeSingle()
          if (profile?.user_name) username = profile.user_name
        } catch {}

        let schedulesRes = await supabase
          .from('schedule')
          .select('id, shift_name, project, start_date, end_date, user_name, employee_name, created_at')
          .eq('user_name', username)
          .order('created_at', { ascending: false })
        let schedules = schedulesRes.data as any[] | null
        // Fallback: try employee_name match if user_name had no rows
        if (!schedules || schedules.length === 0) {
          const retry = await supabase
            .from('schedule')
            .select('id, shift_name, project, start_date, end_date, user_name, employee_name, created_at')
            .or(`user_name.eq.${username},employee_name.eq.${fullName}`)
            .order('created_at', { ascending: false })
          schedules = retry.data as any[] | null
        }

        if (!schedules || schedules.length === 0) { setNextShiftIn('—'); return }

        // Consider most recent active schedule first
        const normDate = (s?: string | null) => {
          if (!s) return s
          // accept YYYY/MM/DD or YYYY-MM-DD; normalize to YYYY-MM-DD
          const t = String(s)
          if (/^\d{4}\/\d{2}\/\d{2}$/.test(t)) return t.replaceAll('/', '-')
          return t
        }
        const candidates = (schedules as any[]).map((s) => ({
          ...s,
          start_date: normDate(s.start_date),
          end_date: normDate(s.end_date),
        }))

        let bestDelta: number | null = null

        for (const s of candidates) {
          // Load template matching shift + project; fallback to by shift_name only
          let tmpl: any = null
          {
            const { data } = await supabase
              .from('template')
              .select('start_time, days, project')
              .eq('shift_name', s.shift_name)
              .eq('project', s.project)
              .maybeSingle()
            tmpl = data
          }
          if (!tmpl) {
            const { data } = await supabase
              .from('template')
              .select('start_time, days, project')
              .eq('shift_name', s.shift_name)
              .maybeSingle()
            tmpl = data
          }
          if (!tmpl) continue
          let weekdays = parseDaysToIndices((tmpl as any).days)
          if (!weekdays || weekdays.length === 0) weekdays = [0,1,2,3,4,5,6]
          const start24 = to24h((tmpl as any).start_time)
          if (!start24) continue
          const [hh, mm] = start24.split(':').map((x) => parseInt(x, 10))

          // Search next 21 days for the earliest next occurrence
          for (let i = 0; i < 21; i++) {
            const d = new Date(now)
            d.setDate(d.getDate() + i)
            const dStr = YYYYMMDD(d)
            const within = (!s.start_date || s.start_date <= dStr) && (!s.end_date || s.end_date >= dStr)
            if (!within) continue
            if (weekdays.includes(d.getDay())) {
              const target = new Date(d)
              target.setHours(hh, mm, 0, 0)
              if (target > now) {
                const delta = target.getTime() - now.getTime()
                if (bestDelta === null || delta < bestDelta) bestDelta = delta
                break
              }
            }
          }
        }

        // Fallback: if nothing matched weekdays window, try earliest next today/tomorrow using template start_time only
        if (bestDelta === null) {
          for (const s of candidates) {
            let tmpl: any = null
            {
              const { data } = await supabase
                .from('template')
                .select('start_time, project')
                .eq('shift_name', s.shift_name)
                .eq('project', s.project)
                .maybeSingle()
              tmpl = data
            }
            if (!tmpl) {
              const { data } = await supabase
                .from('template')
                .select('start_time, project')
                .eq('shift_name', s.shift_name)
                .maybeSingle()
              tmpl = data
            }
            const start24 = to24h((tmpl as any)?.start_time)
            if (!start24) continue
            const [hh, mm] = start24.split(':').map((x) => parseInt(x, 10))
            for (let i = 0; i < 7; i++) {
              const d = new Date(now)
              d.setDate(d.getDate() + i)
              const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
              const within = (!s.start_date || s.start_date <= dStr) && (!s.end_date || s.end_date >= dStr)
              if (!within) continue
              const target = new Date(d)
              target.setHours(hh, mm, 0, 0)
              if (target > now) {
                bestDelta = target.getTime() - now.getTime()
                break
              }
            }
            if (bestDelta !== null) break
          }
        }

        if (bestDelta === null) { setNextShiftIn('—'); return }
        const hours = Math.floor(bestDelta / 3600000)
        const minutes = Math.floor((bestDelta % 3600000) / 60000)
        setNextShiftIn(`${hours}h ${minutes}m`)
      } catch {
        setNextShiftIn('—')
      }
    }

    compute()
  }, [user])

  const handleLogout = () => {
    setShowLogoutConfirm(true)
  }

  const confirmLogout = (ok: boolean) => {
    if (!ok) { setShowLogoutConfirm(false); return }
    setShowLogoutConfirm(false)
    logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'

  const adminLinks = [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/schedules', icon: Calendar, label: 'Schedules' },
    { to: '/admin/reports', icon: FileText, label: 'Reports' },
    { to: '/admin/employees/new', icon: UserPlus, label: 'Add Employee' },
  ]

  const employeeLinks = [
    { to: '/employee', icon: Home, label: 'Home' },
    { to: '/employee/timesheet', icon: Clock, label: 'Timesheet' },
  ]

  const links = isAdmin ? adminLinks : employeeLinks

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-green-50/20 dark:from-gray-950 dark:via-blue-950/20 dark:to-green-950/10 transition-colors duration-500">
      {/* Header */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 100 }}
        className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl backdrop-saturate-150 shadow-sm"
      >
        <div className="container flex h-16 items-center pl-0 pr-4 md:pl-0 md:pr-6 lg:pl-0 lg:pr-8">
          {/* Left: burger + logo */}
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
            <Link to={isAdmin ? '/admin' : '/employee'} className="flex items-center group">
              <img src="/logo1.png" alt="Logo" className="h-10 md:h-8 w-auto object-contain" />
            </Link>
          </div>

          {/* Right cluster: next shift, actions */}
          <div className="ml-auto flex items-center gap-3 md:gap-4 lg:gap-6 xl:gap-8">
            {/* Next shift micro-summary */}
            {!isAdmin && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 text-[11px] sm:text-xs px-2 py-1 sm:px-3 sm:py-2 rounded-2xl bg-secondary/10 border border-secondary/20"
              >
                <Timer className="w-4 h-4 text-secondary" />
                <span className="text-muted-foreground">Next shift in</span>
                <span className="font-semibold text-secondary">{nextShiftIn}</span>
              </motion.div>
            )}

            {/* Profile (replaces Notifications) */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-xl"
                onClick={() => navigate('/profile')}
                title="Edit profile"
              >
                <User className="w-5 h-5" />
              </Button>
            </motion.div>

            {/* Separator for large screens */}
            <span className="hidden lg:block h-6 w-px bg-border/60" />

            {/* Theme toggle */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                title="Toggle theme"
                className="rounded-xl"
              >
                <AnimatePresence mode="wait">
                  {isDark ? (
                    <motion.div
                      key="sun"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Sun className="w-5 h-5 text-yellow-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="moon"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Moon className="w-5 h-5 text-blue-500" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>

            {/* User avatar + role pill + actions */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden md:flex items-center gap-3 px-3 py-2 rounded-2xl bg-muted/50 border border-border/50"
            >
              <div className="h-7 px-3 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 text-xs font-semibold capitalize flex items-center">
                {user?.role}
              </div>
              <div className="w-9 h-9 rounded-full overflow-hidden shadow-md">
                {avatarUrl || user?.avatar || (user as any)?.avatar_url || (user as any)?.image || (user as any)?.picture ? (
                  <img src={(avatarUrl as any) || (user?.avatar as any) || (user as any)?.avatar_url || (user as any)?.image || (user as any)?.picture} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold">
                    {initials}
                  </div>
                )}
              </div>
              <div className="text-sm leading-tight">
                <p className="font-semibold line-clamp-1 max-w-[140px]">{user?.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{user?.email}</p>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleLogout} 
                title="Logout"
                className="rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/40" onClick={() => confirmLogout(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl border bg-background shadow-xl p-6">
              <h3 className="text-lg font-semibold mb-2">Confirm Logout</h3>
              <p className="text-sm text-muted-foreground mb-4">Are you sure you want to log out?</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => confirmLogout(false)}>Cancel</Button>
                <Button className="rounded-xl" onClick={() => confirmLogout(true)}>Log Out</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Sidebar - Desktop */}
        <motion.aside 
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, delay: 0.1 }}
          className="hidden lg:block w-72 border-r border-border/40 min-h-[calc(100vh-4rem)] p-6 bg-background/50 backdrop-blur-sm"
        >
          <nav className="space-y-2">
            {links.map((link, index) => {
              const Icon = link.icon
              const isActive = location.pathname === link.to
              return (
                <motion.div
                  key={link.to}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link to={link.to}>
                    <motion.div
                      whileHover={{ x: 5 }}
                      whileTap={{ scale: 0.98 }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
                        isActive
                          ? 'bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg shadow-primary/25'
                          : 'hover:bg-muted/50 hover:shadow-md'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
                      <span className="font-medium">{link.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="activeTab"
                          className="ml-auto"
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </motion.div>
                      )}
                    </motion.div>
                  </Link>
                </motion.div>
              )
            })}
          </nav>
        </motion.aside>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-md"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <motion.aside
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: "spring", stiffness: 100 }}
                className="fixed left-0 top-16 bottom-0 w-72 border-r border-border/40 bg-background/95 backdrop-blur-xl p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <nav className="space-y-2">
                  {links.map((link, index) => {
                    const Icon = link.icon
                    const isActive = location.pathname === link.to
                    return (
                      <motion.div
                        key={link.to}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Link
                          to={link.to}
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <motion.div
                            whileTap={{ scale: 0.98 }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
                              isActive
                                ? 'bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <Icon className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
                            <span className="font-medium">{link.label}</span>
                          </motion.div>
                        </Link>
                      </motion.div>
                    )
                  })}
                </nav>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
