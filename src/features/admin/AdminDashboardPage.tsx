import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Users, 
  Clock, 
  AlertCircle, 
  Coffee, 
  TrendingUp, 
  Search,
  
  MapPin,
  Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Types
interface Employee {
  id: string
  name: string
  clockIn: string
  status: 'working' | 'break'
  location: string
  duration: string
  lateBy?: number
  avatar?: string
}

interface KPIStat {
  label: string
  value: number
  delta: string
  icon: React.ElementType
  color: string
  sparkline: number[]
}
 

// Sparkline SVG component with gradient
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const width = 80
  const height = 32
  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((value - min) / range) * height * 0.8 - 2
      return `${x},${y}`
    })
    .join(' ')

  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg width={width} height={height} className="opacity-80">
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" className={color} stopOpacity="0.3" />
          <stop offset="100%" className={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#gradient-${color})`}
        points={areaPoints}
      />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className={color}
      />
    </svg>
  )
}

export function AdminDashboardPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState<boolean>(false)
  const [employeesNow, setEmployeesNow] = useState<Employee[]>([])
  const [stats, setStats] = useState<KPIStat[]>([])

  // Load today's activity from Supabase
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const now = new Date()
        const start = new Date(now); start.setHours(0,0,0,0)
        const end = new Date(now); end.setHours(23,59,59,999)
        const startStr = start.toISOString().split('T')[0]
        const endStr = end.toISOString().split('T')[0]

        const { data: ins } = await supabase
          .from('clock_in')
          .select('*')
          .gte('created_at', startStr)
          .lte('created_at', endStr + 'T23:59:59')
          .order('created_at', { ascending: true })

        const { data: outs } = await supabase
          .from('clock_out')
          .select('user_name, created_at')
          .gte('created_at', startStr)
          .lte('created_at', endStr + 'T23:59:59')

        // Fetch profiles to show avatars
        const { data: usersTbl } = await supabase
          .from('user')
          .select('user_name, profile')

        const outsByUser = new Map<string, Date>()
        for (const o of outs || []) {
          if (!o.user_name) continue
          const prev = outsByUser.get(o.user_name)
          const d = new Date(o.created_at)
          if (!prev || d > prev) outsByUser.set(o.user_name, d)
        }

        const profileByUser = new Map<string, string>()
        for (const u of usersTbl || []) {
          if (u?.user_name && u?.profile) profileByUser.set(u.user_name, u.profile)
        }

        // Map current employees
        const list: Employee[] = (ins || [])
          .filter((ci: any) => {
            // Exclude if user has clocked out after this clock in today
            const lastOut = ci.user_name ? outsByUser.get(ci.user_name) : undefined
            if (!lastOut) return true
            const inDt = new Date(ci.created_at)
            return lastOut <= inDt ? true : false
          })
          .map((ci: any) => {
          const dateStr = new Date(ci.created_at).toISOString().split('T')[0]
          const clockInTime = ci.clockIn || to12h(new Date(ci.created_at).toISOString().substring(11,16))
          const inDt = parseTimeToDate(ci.clockIn, dateStr) || new Date(ci.created_at)
          const nowDt = new Date()
          let workedMin = Math.max(0, Math.floor((nowDt.getTime() - inDt.getTime())/60000))
          // Subtract ongoing break if started
          if (ci.startBreak && !ci.endBreak) {
            const b1 = parseTimeToDate(ci.startBreak, dateStr)
            if (b1) workedMin = Math.max(0, workedMin - Math.max(0, Math.floor((nowDt.getTime()-b1.getTime())/60000)))
          }
            const duration = formatMinutes(workedMin)
            const status: 'working'|'break' = ci.startBreak && !ci.endBreak ? 'break' : 'working'
            // Late vs 9:00 AM baseline (simple)
            let lateBy: number | undefined
            const baseline = new Date(inDt); baseline.setHours(9,0,0,0)
            if (inDt > baseline) lateBy = Math.floor((inDt.getTime()-baseline.getTime())/60000)
            // Choose avatar: prefer user.profile if it looks valid; else use latest clock_in image
            const profile = ci.user_name ? profileByUser.get(ci.user_name) : undefined
            const candidate = (typeof profile === 'string' ? profile.trim() : undefined) || (ci.image ? String(ci.image) : undefined)

            return {
              id: String(ci.id),
              name: ci.name || ci.user_name || 'Unknown',
              clockIn: clockInTime,
              status,
              location: ci.location || '—',
              duration,
              lateBy,
              avatar: isLikelyValidImageSrc(candidate) ? candidate : undefined,
            }
          })

        setEmployeesNow(list)

        // Stats with mock sparkline data for visual appeal
        const present = list.length
        const late = list.filter(e => (e.lateBy ?? 0) > 0).length
        const onBreak = list.filter(e => e.status === 'break').length
        const flags = 0
        
        // Generate realistic sparkline data
        const generateSparkline = (base: number, variance: number = 5) => {
          return Array.from({ length: 7 }, () => Math.max(0, base + Math.random() * variance - variance/2))
        }
        
        setStats([
          { label: 'Present Today', value: present, delta: '+12% from yesterday', icon: Users, color: 'text-emerald-600', sparkline: generateSparkline(present, 8) },
          { label: 'Late Today', value: late, delta: late > 0 ? `${Math.round(late/present * 100)}% of present` : 'All on time!', icon: Clock, color: 'text-amber-600', sparkline: generateSparkline(late, 3) },
          { label: 'On Break', value: onBreak, delta: 'Currently active', icon: Coffee, color: 'text-sky-600', sparkline: generateSparkline(onBreak, 4) },
          { label: 'Flags', value: flags, delta: 'No issues', icon: AlertCircle, color: 'text-rose-600', sparkline: generateSparkline(flags, 2) },
        ])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredEmployees = employeesNow.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Dashboard</h1>
            <p className="text-muted-foreground mt-2">Real-time attendance overview and analytics</p>
          </div>
        </div>
      </motion.div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          const isPositive = stat.delta.includes('+') || stat.delta.includes('on time') || stat.delta.includes('No issues')
          return (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              whileHover={{ y: -5 }}
              className="group"
            >
              <Card className="card-modern glass overflow-hidden hover:shadow-2xl transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardContent className="p-6 relative h-36 md:h-40">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl ${stat.color.replace('text-', 'bg-').replace('600', '100')} dark:${stat.color.replace('text-', 'bg-').replace('600', '900/20')} flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${stat.color}`} />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {stat.label}
                        </p>
                        <p className={`text-3xl md:text-4xl font-bold bg-gradient-to-r ${stat.color.includes('emerald') ? 'from-emerald-600 to-green-600' : stat.color.includes('amber') ? 'from-amber-600 to-yellow-600' : stat.color.includes('sky') ? 'from-sky-600 to-blue-600' : 'from-rose-600 to-red-600'} bg-clip-text text-transparent`}>
                          {stat.value}
                        </p>
                      </div>
                      {/* Delta info removed for cleaner, uniform cards */}
                    </div>
                    {/* Sparkline removed */}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Who's In Now */}
      <motion.div
        variants={itemVariants}
      >
        <Card className="card-modern glass overflow-hidden">
          <CardHeader className="px-6 py-4 border-b border-border/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">Who's In Now</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{employeesNow.length} employees currently active</p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full max-w-sm">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 rounded-xl bg-muted/50 border-border/50 focus:bg-background transition-colors"
                  />
                </div>
                <Badge variant="secondary" className="rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
                  Live
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 md:px-6">
            {/* Employee List */}
            <div className="space-y-3">
              {filteredEmployees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No employees match your filters</p>
                </div>
              ) : (
                filteredEmployees.map((employee) => {
                  const initials = employee.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')

                  return (
                    <motion.div
                      key={employee.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      whileHover={{ x: 5 }}
                      className="group flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl bg-muted/30 hover:bg-muted/50 hover:shadow-lg transition-all duration-300 gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <motion.div 
                          whileHover={{ scale: 1.1 }}
                          className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold text-sm shadow-md"
                        >
                          {employee.avatar ? (
                            <img src={employee.avatar} alt={employee.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </motion.div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm md:text-base truncate">{employee.name}</p>
                          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground flex-wrap">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span className="whitespace-nowrap">In: {employee.clockIn}</span>
                            <span className="hidden sm:inline">•</span>
                            <span className="whitespace-nowrap">{employee.duration}</span>
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {employee.location}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 md:gap-3 justify-between sm:justify-end">
                        <div className="flex gap-1.5 md:gap-2 flex-wrap">
                          {employee.status === 'break' ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200 text-xs whitespace-nowrap"
                            >
                              <span className="hidden sm:inline">On Break</span>
                              <span className="sm:hidden">Break</span>
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200 text-xs whitespace-nowrap"
                            >
                              Working
                            </Badge>
                          )}
                          {employee.lateBy && (
                            <Badge
                              variant="secondary"
                              className="bg-rose-100 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200 text-xs whitespace-nowrap"
                            >
                              Late {formatMinutes(employee.lateBy)}
                            </Badge>
                          )}
                        </div>
                        {/* Quick actions removed per request */}
                      </div>
                    </motion.div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters modal removed */}
    </motion.div>
  )
}

// Helpers
function to12h(hhmm: string) {
  if (!hhmm) return hhmm
  const [hStr, mStr] = hhmm.split(':')
  let h = Number(hStr)
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  const hPad = h < 10 ? `0${h}` : String(h)
  return `${hPad}:${mStr} ${ampm}`
}

function parseTimeToDate(timeStr?: string | null, dateStr?: string): Date | null {
  if (!timeStr || !dateStr) return null
  try {
    if (timeStr.includes('T') || timeStr.includes('-')) return new Date(timeStr)
    const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (!m) return null
    let h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    const period = m[3].toUpperCase()
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const d = new Date(dateStr)
    d.setHours(h, min, 0, 0)
    return d
  } catch { return null }
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function isLikelyValidImageSrc(src?: string) {
  if (!src) return false
  const s = src.trim()
  if (/^https?:\/\//i.test(s)) return true
  // Require a minimum length for data URLs to avoid tiny/truncated blobs that render as black
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(s)) return s.length > 200
  return false
}
