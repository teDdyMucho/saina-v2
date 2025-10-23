import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, Loader2, MapPin, Image as ImageIcon, X } from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface TimesheetEntry {
  id: string
  date: string
  clockIn: string
  clockOut: string | null
  workedMinutes: number
  breakMinutes: number
  lateMinutes: number
  flags: string[]
  clockInImage?: string | null
  clockOutImage?: string | null
  clockInLocation?: string | null
  clockOutLocation?: string | null
}

interface WeeklySummary {
  totalWorked: number
  totalBreak: number
  totalLate: number
}

export function Timesheet() {
  const { user } = useAuthStore()
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
  const [summary, setSummary] = useState<WeeklySummary>({
    totalWorked: 0,
    totalBreak: 0,
    totalLate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null)

  useEffect(() => {
    fetchTimesheetData()
  }, [user])

  const fetchTimesheetData = async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)

      // Get current week's date range
      const now = new Date()
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay()) // Sunday
      startOfWeek.setHours(0, 0, 0, 0)
      
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 6) // Saturday
      endOfWeek.setHours(23, 59, 59, 999)

      const startDateStr = startOfWeek.toISOString().split('T')[0]
      const endDateStr = endOfWeek.toISOString().split('T')[0]

      // Resolve actual user_name used in clock tables
      let userKey = user.email || user.name
      try {
        const { data: profile } = await supabase
          .from('user')
          .select('user_name')
          .eq('name', user.name)
          .maybeSingle()
        if (profile?.user_name) userKey = profile.user_name
      } catch {}

      // Fetch clockIn records for the current user
      const { data: clockInData, error: clockInError } = await supabase
        .from('clock_in')
        .select('*')
        .eq('user_name', userKey)
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr + 'T23:59:59')
        .order('created_at', { ascending: false })

      if (clockInError) throw clockInError

      // Fetch clockOut records for the current user
      const { data: clockOutData, error: clockOutError } = await supabase
        .from('clock_out')
        .select('*')
        .eq('user_name', userKey)
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr + 'T23:59:59')
        .order('created_at', { ascending: false })

      if (clockOutError) throw clockOutError

      // Fetch schedules and templates for accurate late calculation
      const { data: schedules } = await supabase
        .from('schedule')
        .select('shift_name, start_date, end_date, user_name')
        .eq('user_name', userKey)

      const { data: templates } = await supabase
        .from('template')
        .select('shift_name, start_time, days')

      // Process and merge data
      const processedData = processTimesheetData(clockInData || [], clockOutData || [], schedules || [], templates || [])
      setTimesheets(processedData)

      // Calculate summary
      const weeklySummary = calculateWeeklySummary(processedData)
      setSummary(weeklySummary)
    } catch (err) {
      console.error('Error fetching timesheet data:', err)
      setError('Failed to load timesheet data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const processTimesheetData = (clockInRecords: any[], clockOutRecords: any[], schedules: any[], templates: any[]): TimesheetEntry[] => {
    // Sort outs ascending by created_at for efficient pairing
    const outsSorted = [...clockOutRecords].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const usedOuts = new Set<number | string>()

    const entries: TimesheetEntry[] = []

    for (const record of clockInRecords) {
      const inDateISO = new Date(record.created_at).toISOString().split('T')[0]
      const clockInTime = record.clockIn || formatTime(record.created_at)

      const entry: TimesheetEntry = {
        id: record.id?.toString() || record.clockIn_id,
        date: inDateISO,
        clockIn: clockInTime,
        clockOut: null,
        workedMinutes: 0,
        breakMinutes: 0,
        lateMinutes: 0,
        flags: [],
        clockInImage: record.image || null,
        clockInLocation: record.location || null,
        clockOutImage: null,
        clockOutLocation: null,
      }

      // Pair with the nearest future clock_out for the same user within 36 hours (handles overnight)
      const inCreated = new Date(record.created_at).getTime()
      const cutoff = inCreated + 36 * 60 * 60 * 1000
      const candidate = outsSorted.find((out) => out.user_name === record.user_name && !usedOuts.has(out.id ?? out.created_at) && new Date(out.created_at).getTime() > inCreated && new Date(out.created_at).getTime() <= cutoff)

      if (candidate) {
        usedOuts.add(candidate.id ?? candidate.created_at)
        entry.clockOut = candidate.clockOut || formatTime(candidate.created_at)
        entry.clockOutImage = candidate.image || null
        entry.clockOutLocation = candidate.location || null

        const inDt = parseTimeToDate(record.clockIn, inDateISO) || new Date(record.created_at)
        // If clock out is on the next day, parse with that date
        const outDateISO = new Date(candidate.created_at).toISOString().split('T')[0]
        const outDt = parseTimeToDate(candidate.clockOut, outDateISO) || new Date(candidate.created_at)

        if (inDt && outDt && outDt > inDt) {
          const totalMinutes = Math.max(0, Math.floor((outDt.getTime() - inDt.getTime()) / 60000))
          let breakMinutes = 0
          if (record.startBreak && record.endBreak) {
            const b1 = parseTimeToDate(record.startBreak, inDateISO)
            const b2 = parseTimeToDate(record.endBreak, inDateISO)
            if (b1 && b2) {
              // count break only if fully within the worked window
              if (b1 >= inDt && b2 <= outDt && b2 > b1) {
                breakMinutes = Math.max(0, Math.floor((b2.getTime() - b1.getTime()) / 60000))
              }
            }
          }
          entry.breakMinutes = breakMinutes
          entry.workedMinutes = Math.max(0, totalMinutes - breakMinutes)
        }
      }

      // Late check vs schedule template start_time
      const inDtForLate = parseTimeToDate(record.clockIn, inDateISO) || new Date(record.created_at)
      if (inDtForLate) {
        // find active schedule for this date
        const dateObj = new Date(inDateISO)
        const activeSched = (schedules || []).find((s: any) => {
          const sd = s.start_date ? new Date(s.start_date) : null
          const ed = s.end_date ? new Date(s.end_date) : null
          return (!sd || dateObj >= sd) && (!ed || dateObj <= ed)
        })
        const tmpl = activeSched ? (templates || []).find((t: any) => t.shift_name === activeSched.shift_name) : null
        let baseline: Date | null = null
        if (tmpl?.start_time) baseline = parseTimeToDate(String(tmpl.start_time), inDateISO)
        if (!baseline) {
          baseline = new Date(inDtForLate)
          baseline.setHours(9, 0, 0, 0)
        }
        if (baseline && inDtForLate > baseline) {
          entry.lateMinutes = Math.floor((inDtForLate.getTime() - baseline.getTime()) / 60000)
          entry.flags.push('late')
        }
      }

      entries.push(entry)
    }

    return entries
  }

  const calculateWeeklySummary = (entries: TimesheetEntry[]): WeeklySummary => {
    return entries.reduce(
      (acc, entry) => ({
        totalWorked: acc.totalWorked + entry.workedMinutes,
        totalBreak: acc.totalBreak + entry.breakMinutes,
        totalLate: acc.totalLate + entry.lateMinutes,
      }),
      { totalWorked: 0, totalBreak: 0, totalLate: 0 }
    )
  }

  const formatTime = (timeStr: string): string => {
    try {
      const date = new Date(timeStr)
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return timeStr
    }
  }

  const parseTimeToDate = (timeStr: string | null | undefined, dateStr: string): Date | null => {
    if (!timeStr) return null
    
    try {
      // If it's already a full timestamp
      if (timeStr.includes('T') || timeStr.includes('-')) {
        return new Date(timeStr)
      }
      
      // If it's a time string like "09:05 AM"
      const timeParts = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (timeParts) {
        let hours = parseInt(timeParts[1], 10)
        const minutes = parseInt(timeParts[2], 10)
        const period = timeParts[3].toUpperCase()
        
        if (period === 'PM' && hours !== 12) hours += 12
        if (period === 'AM' && hours === 12) hours = 0
        
        const date = new Date(dateStr)
        date.setHours(hours, minutes, 0, 0)
        return date
      }
      
      return null
    } catch {
      return null
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-10">
        <LoadingSpinner 
          message="" 
          fullScreen={false}
          size="lg" 
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Timesheet</h2>
          <p className="text-muted-foreground">View your attendance history</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Timesheet</h2>
        <p className="text-muted-foreground">View your attendance history</p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>This Week Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{formatDuration(summary.totalWorked)}</p>
              <p className="text-sm text-muted-foreground">Total Worked</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{formatDuration(summary.totalBreak)}</p>
              <p className="text-sm text-muted-foreground">Total Break</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{formatDuration(summary.totalLate)}</p>
              <p className="text-sm text-muted-foreground">Late Minutes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timesheet List */}
      <div className="space-y-3">
        {timesheets.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>No timesheet entries found for this week.</p>
            </CardContent>
          </Card>
        ) : (
          timesheets.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Header with date and badges */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {new Date(entry.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-2 items-end">
                    {entry.flags.includes('late') && (
                      <Badge variant="warning">
                        Late {formatDuration(entry.lateMinutes)}
                      </Badge>
                    )}
                    {entry.flags.length === 0 && (
                      <Badge variant="success">On Time</Badge>
                    )}
                  </div>
                </div>

                {/* Clock In/Out Times and Stats */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span>In: {entry.clockIn}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span>Out: {entry.clockOut || 'N/A'}</span>
                  </div>
                </div>

                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Worked: <strong>{formatDuration(entry.workedMinutes)}</strong>
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    Break: <strong>{formatDuration(entry.breakMinutes)}</strong>
                  </span>
                </div>

                {/* Images and Locations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                  {/* Clock In Section */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Clock In</p>
                    {entry.clockInImage && (
                      <div className="relative rounded-lg overflow-hidden border bg-muted/50 cursor-zoom-in" onClick={() => setPreview({ src: entry.clockInImage as string, title: 'Clock In' })}>
                        <img
                          src={entry.clockInImage}
                          alt="Clock In"
                          className="w-full h-32 object-cover"
                        />
                      </div>
                    )}
                    {!entry.clockInImage && (
                      <div className="flex items-center justify-center h-32 rounded-lg border bg-muted/50">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                    )}
                    {entry.clockInLocation && (
                      <div className="flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{entry.clockInLocation}</span>
                      </div>
                    )}
                  </div>

                  {/* Clock Out Section */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Clock Out</p>
                    {entry.clockOutImage && (
                      <div className="relative rounded-lg overflow-hidden border bg-muted/50 cursor-zoom-in" onClick={() => setPreview({ src: entry.clockOutImage as string, title: 'Clock Out' })}>
                        <img
                          src={entry.clockOutImage}
                          alt="Clock Out"
                          className="w-full h-32 object-cover"
                        />
                      </div>
                    )}
                    {!entry.clockOutImage && entry.clockOut && (
                      <div className="flex items-center justify-center h-32 rounded-lg border bg-muted/50">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                    )}
                    {!entry.clockOut && (
                      <div className="flex items-center justify-center h-32 rounded-lg border bg-muted/50">
                        <span className="text-sm text-muted-foreground">Not clocked out yet</span>
                      </div>
                    )}
                    {entry.clockOutLocation && (
                      <div className="flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{entry.clockOutLocation}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
        )}
      </div>
      {/* Image Lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow hover:opacity-90"
              aria-label="Close preview"
              onClick={() => setPreview(null)}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="bg-background rounded-lg overflow-hidden">
              <img src={preview.src} alt={preview.title} className="w-full h-auto max-h-[80vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
