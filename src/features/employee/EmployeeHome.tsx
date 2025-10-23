import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAttendanceStore } from '@/stores/useAttendanceStore'
import { Clock, MapPin, Camera,Coffee, LogOut as LogOutIcon, CheckCircle2, AlertTriangle, Satellite, Timer, Calendar, TrendingUp, Activity, Briefcase } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { getCurrentPosition, isWithinGeofence } from '@/lib/geo'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useNavigate } from 'react-router-dom'

export function EmployeeHome() {
  const { currentSession, isOnBreak, clockIn, clockOut, startBreak, endBreak, getTotalBreakTime } = useAttendanceStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [elapsedTime, setElapsedTime] = useState('00:00:00')
  const [isCapturing, setIsCapturing] = useState(false)
  const [gpsLocked, setGpsLocked] = useState(false)
  const [insideGeofence, setInsideGeofence] = useState<boolean | null>(null)
  const [selfieReady, setSelfieReady] = useState(false)
  const [cameraBlocked, setCameraBlocked] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null)
  const [currentClockInId, setCurrentClockInId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [shift, setShift] = useState({
    startTime: '--',
    endTime: '--',
    location: 'Main Office',
    lat: 40.7128,
    lng: -74.0060,
    radiusMeters: 100,
  })

  // Weekly summary removed; Timesheet page owns these KPIs now

  // Load clockIn_id from localStorage on mount
  useEffect(() => {
    try {
      const storedClockInId = localStorage.getItem('currentClockInId')
      if (storedClockInId) {
        setCurrentClockInId(storedClockInId)
        console.log('Loaded clockIn_id:', storedClockInId)
      }
    } catch (error) {
      console.error('Failed to load clockIn_id:', error)
    }
  }, [])

  // Load today's shift for logged-in user by user_name, then match template by shift_name + project
  useEffect(() => {
    const fetchToday = async () => {
      if (!user) return
      let username = user.email
      const fullName = user.name
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`

      // Resolve actual user_name from user table if present
      try {
        const { data: profile } = await supabase
          .from('user')
          .select('user_name')
          .eq('name', fullName)
          .maybeSingle()
        if (profile?.user_name) username = profile.user_name
      } catch {}

      // Find schedules for this user_name
      const { data: schedules, error } = await supabase
        .from('schedule')
        .select('id, shift_name, project, start_date, end_date, user_name, created_at')
        .eq('user_name', username)
        .order('created_at', { ascending: false })

      if (error || !schedules || schedules.length === 0) return

      // Pick first active schedule covering today
      const active = schedules.find((s: any) => {
        const startOk = !s.start_date || s.start_date <= todayStr
        const endOk = !s.end_date || s.end_date >= todayStr
        return startOk && endOk
      }) || schedules[0]

      if (!active?.shift_name) return

      // Match template by both shift_name and project
      const { data: tmpl } = await supabase
        .from('template')
        .select('start_time, end_time, break_time, days, project')
        .eq('shift_name', active.shift_name)
        .eq('project', active.project)
        .maybeSingle()

      if (tmpl) {
        const to12h = (s?: string) => {
          if (!s) return '--'
          const m = String(s).toLowerCase().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/)
          if (!m) return s
          let h = parseInt(m[1], 10)
          const min = m[2]
          const hasAmPm = !!m[3]
          let ampm = m[3]
          if (!hasAmPm) {
            ampm = h >= 12 ? 'pm' : 'am'
            h = h % 12
            if (h === 0) h = 12
          }
          const hh = h < 10 ? `0${h}` : String(h)
          return `${hh}:${min} ${ampm}`
        }
        setShift((prev) => ({
          ...prev,
          startTime: to12h(tmpl.start_time) || prev.startTime,
          endTime: to12h(tmpl.end_time) || prev.endTime,
        }))
      }
    }
    fetchToday()
  }, [user])

  // Weekly summary removed

  // Inline camera is disabled; use dedicated capture route instead

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
      if (currentSession) {
        const totalElapsed = Date.now() - currentSession.timestamp.getTime()
        const totalBreakTime = getTotalBreakTime()
        const workingTime = totalElapsed - totalBreakTime
        
        const hours = Math.floor(workingTime / 3600000)
        const minutes = Math.floor((workingTime % 3600000) / 60000)
        const seconds = Math.floor((workingTime % 60000) / 1000)
        setElapsedTime(
          `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        )
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [currentSession, getTotalBreakTime])

  const handleAction = async (action: 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut') => {
    // Allow only employees to perform clock actions
    if (user?.role !== 'employee') {
      try { alert('Only employees can perform this action.') } catch {}
      return
    }
    // For start/end break, send to webhook directly without selfie
    if (action === 'startBreak' || action === 'endBreak') {
      setIsCapturing(true)
      try {
        const clockInId = currentClockInId || localStorage.getItem('currentClockInId')
        console.log('Break action:', action, 'clockIn_id:', clockInId)
        
        if (!clockInId) {
          console.error('No clockIn_id found in state or localStorage')
          setGeoError('No active clock-in session found. Please clock in first.')
          setIsCapturing(false)
          return
        }

        const now = new Date()
        const formatTime12h = (d: Date) => {
          const pad = (n: number) => n.toString().padStart(2, '0')
          let h = d.getHours()
          const ampm = h >= 12 ? 'PM' : 'AM'
          h = h % 12
          if (h === 0) h = 12
          const hh = pad(h)
          const mins = pad(d.getMinutes())
          return `${hh}:${mins} ${ampm}`
        }
        const formattedTime = formatTime12h(now)

        // Send to webhook
        const payload = {
          clockIn_id: clockInId,
          action,
          time: formattedTime,
          employee: user ? { name: user.name, username: user.email } : null,
        }

        const response = await fetch('https://primary-production-6722.up.railway.app/webhook/clockIn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(err => {
          console.error('Webhook fetch error:', err)
          throw new Error('Network error')
        })

        if (!response || !response.ok) {
          throw new Error('Webhook request failed')
        }

        // Update local state only after successful webhook call
        if (action === 'startBreak') {
          startBreak()
        } else {
          endBreak()
          try { localStorage.setItem('breakCompleted', '1') } catch {}
        }
      } catch (error) {
        console.error('Break action error:', error)
        setGeoError('Failed to process break action. Please try again.')
      } finally {
        setIsCapturing(false)
      }
      return
    }

    // For clock in/out, use selfie capture flow
    setIsCapturing(true)
    try {
      localStorage.setItem('pendingAction', action)
      console.log('Navigating to /employee/selfie with action:', action)
      navigate('/employee/selfie')
      // Fallback: ensure navigation even if router navigation is blocked
      setTimeout(() => {
        if (location.pathname !== '/employee/selfie') {
          try {
            window.location.assign('/employee/selfie')
          } catch {}
        }
      }, 300)
      return
    } catch (error) {
      console.error('Navigation error:', error)
      setGeoError('Unable to open selfie capture')
    } finally {
      setIsCapturing(false)
    }
  }

  // After returning from the capture route, if selfie + geo exist in localStorage, complete the pending action
  useEffect(() => {
    const checkAndProcess = () => {
      const selfie = localStorage.getItem('selfieDataUrl')
      const geo = localStorage.getItem('lastGeo')
      const lastAddress = localStorage.getItem('lastAddress')
      const pendingAction = (localStorage.getItem('pendingAction') as any) as 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut' | null
      if (!selfie || !geo || !pendingAction) return

      try {
        const { lat, lng } = JSON.parse(geo)
        setSelfieDataUrl(selfie)
        setSelfieReady(true)
        setGpsLocked(true)

        // Check geofence
        const withinGeofence = isWithinGeofence(
          lat,
          lng,
          shift.lat,
          shift.lng,
          shift.radiusMeters
        )

        if (!withinGeofence) {
          setInsideGeofence(false)
          setGeoError('You are outside the required geofence area')
        } else {
          setInsideGeofence(true)
          setGeoError(null)
        }

        // Apply local state change based on action (proceed even if outside geofence)
        if (pendingAction === 'clockIn') {
          clockIn({ lat, lng, address: lastAddress || undefined })
          try { 
            localStorage.removeItem('breakCompleted')
            // Load clockIn_id from localStorage if it was set by SelfieCapture
            const storedClockInId = localStorage.getItem('currentClockInId')
            if (storedClockInId) {
              setCurrentClockInId(storedClockInId)
            }
          } catch {}
        } else if (pendingAction === 'startBreak') {
          startBreak()
        } else if (pendingAction === 'endBreak') {
          endBreak()
          try { localStorage.setItem('breakCompleted', '1') } catch {}
        } else if (pendingAction === 'clockOut') {
          clockOut()
          try { 
            localStorage.removeItem('breakCompleted')
            localStorage.removeItem('currentClockInId')
            localStorage.removeItem('lastAddress')
            setCurrentClockInId(null)
          } catch {}
        }

        // Optionally send to webhook if configured
        const webhook = import.meta.env.VITE_CLOCKIN_WEBHOOK as string | undefined
        if (webhook) {
          const payload = {
            user: { name: user?.name, username: user?.email },
            timestamp: new Date().toISOString(),
            location: { lat, lng },
            selfie,
            shift: { startTime: shift.startTime, endTime: shift.endTime },
          }
          // fire-and-forget; do not block UI
          fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(() => {})
        }
        // Clear the cached items
        localStorage.removeItem('selfieDataUrl')
        localStorage.removeItem('lastGeo')
        localStorage.removeItem('lastAddress')
        localStorage.removeItem('pendingAction')
      } catch (e) {
        // ignore parse errors
        localStorage.removeItem('selfieDataUrl')
        localStorage.removeItem('lastGeo')
        localStorage.removeItem('lastAddress')
        localStorage.removeItem('pendingAction')
      }
    }

    checkAndProcess()
    
    // Also check on window focus (when returning from selfie page)
    const handleFocus = () => checkAndProcess()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user, clockIn, clockOut, startBreak, endBreak, shift])

  // Derived UI states
  const disabledReason = null

  // Decide button label and action
  let mainAction: 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut' = 'clockIn'
  let mainLabel = 'Clock In'
  const breakDone = typeof window !== 'undefined' ? localStorage.getItem('breakCompleted') === '1' : false
  if (currentSession) {
    if (isOnBreak) {
      mainAction = 'endBreak'
      mainLabel = 'End Break'
    } else if (!breakDone) {
      mainAction = 'startBreak'
      mainLabel = 'Start Break'
    } else {
      mainAction = 'clockOut'
      mainLabel = 'Clock Out'
    }
  }

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

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Row A: Current Time and Today's Shift */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch" aria-live="polite">
        <motion.div variants={itemVariants} className="h-full">
          <Card className="card-modern glass overflow-hidden group hover:shadow-2xl transition-all duration-300 md:min-h-[260px] h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-8 pb-8 relative">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Current Time</p>
                  <p className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    {formatTime(currentTime)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} className="h-full">
          <Card className="card-modern glass overflow-hidden group hover:shadow-2xl transition-all duration-300 md:min-h-[260px] h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardHeader className="pb-3 relative">
              <CardTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary to-secondary/80 flex items-center justify-center shadow-lg shadow-secondary/25">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl">{/pm\s*$/i.test(String(shift.startTime).trim()) ? "Tonight's Shift" : "Today's Shift"}</span>
              </CardTitle>
              <CardDescription className="ml-13">Be on time and within geofence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Start Time</p>
                  <p className="text-2xl font-bold text-primary">{shift.startTime}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">End Time</p>
                  <p className="text-2xl font-bold text-secondary">{shift.endTime}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Row B: Clock-in panel */}
      {!currentSession ? (
        <motion.div variants={itemVariants}>
          <Card className="card-modern glass overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-2xl">Ready to {mainLabel}?</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-2">
                {insideGeofence ? (
                  <span className="text-green-600 dark:text-green-400">You're inside the {shift.radiusMeters}m geofence</span>
                ) : insideGeofence === false ? (
                  <span className="text-amber-600 dark:text-amber-400">Outside geofence</span>
                ) : (
                  <span className="text-muted-foreground">Checking location…</span>
                )}
                {' '}
                • {gpsLocked ? 'GPS locked' : 'GPS…'} • {selfieReady ? 'Selfie ready' : 'Selfie pending'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selfie is captured in /employee/selfie route */}

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <motion.div animate={selfieReady ? { scale: 1.05 } : {}} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                    {selfieReady ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Camera className="w-4 h-4 text-muted-foreground" />
                    )}
                  </motion.div>
                  <span>Selfie</span>
                </div>
                <div className="flex items-center gap-2">
                  <motion.div animate={gpsLocked ? { scale: 1.05 } : {}} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                    {gpsLocked ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Satellite className="w-4 h-4 text-muted-foreground" />
                    )}
                  </motion.div>
                  <span>GPS</span>
                </div>
              </div>

              {/* Warning / Info banners */}
              {geoError && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200 p-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <div className="text-sm">
                    <p>{geoError}</p>
                    {insideGeofence === false && (
                      <a className="underline" href="https://www.google.com/maps" target="_blank" rel="noreferrer">Open Maps</a>
                    )}
                  </div>
                </div>
              )}
              {cameraBlocked && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200 p-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <div className="text-sm">
                    <p>Camera blocked</p>
                    <button className="underline" onClick={() => window.open('about:preferences#privacy')}>Enable camera</button>
                  </div>
                </div>
              )}

              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={() => handleAction(mainAction)}
                  className="w-full h-14 text-lg gradient-primary text-white font-semibold rounded-2xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                  size="lg"
                  disabled={isCapturing}
                >
                  {isCapturing ? 'Preparing…' : mainLabel}
                </Button>
              </motion.div>
              {disabledReason && (
                <p className="text-sm text-muted-foreground">{disabledReason}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        // Active Session
        <motion.div variants={itemVariants}>
          <Card className="card-modern glass overflow-hidden border-2 border-green-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-3 text-2xl">
                <div className="relative">
                  <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />
                  <div className="absolute inset-0 w-4 h-4 bg-green-500 rounded-full animate-ping" />
                </div>
                <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Currently Clocked In</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 relative">
              <div className="text-center p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl">
                <p className="text-sm font-medium text-muted-foreground mb-3">Time Elapsed</p>
                <p className="text-6xl font-bold font-mono bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">{elapsedTime}</p>
              </div>
              {!breakDone ? (
                <div className="grid grid-cols-2 gap-3">
                  {!isOnBreak ? (
                    <Button 
                      onClick={() => handleAction('startBreak')} 
                      variant="outline" 
                      className="h-12"
                      disabled={isCapturing}
                    >
                      <Coffee className="w-4 h-4 mr-2" /> {isCapturing ? 'Processing...' : 'Start Break'}
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => handleAction('endBreak')} 
                      variant="secondary" 
                      className="h-12"
                      disabled={isCapturing}
                    >
                      <Coffee className="w-4 h-4 mr-2" /> {isCapturing ? 'Processing...' : 'End Break'}
                    </Button>
                  )}
                  <Button 
                    onClick={() => handleAction('clockOut')} 
                    variant="destructive" 
                    className="h-12"
                    disabled={isCapturing}
                  >
                    <LogOutIcon className="w-4 h-4 mr-2" /> Clock Out
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={() => handleAction('clockOut')} 
                  variant="destructive" 
                  className="w-full h-12"
                  disabled={isCapturing}
                >
                  <LogOutIcon className="w-4 h-4 mr-2" /> Clock Out
                </Button>
              )}
              {isOnBreak && (
                <Badge variant="warning" className="w-full justify-center py-2">On Break</Badge>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Weekly summary KPIs removed; see Timesheet page */}
    </motion.div>
  )
}
