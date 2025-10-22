import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Download, Filter, Calendar, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

type ReportRow = {
  id: string
  employee: string
  project: string
  daysWorked: number
  totalHours: number // hours (not minutes)
  lateCount: number
  absences: number
  userName?: string
}

export function Reports() {
  const [filters, setFilters] = useState({
    startDate: '', // yyyy-mm-dd
    endDate: '',   // yyyy-mm-dd
    department: '',
    employee: '',
  })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  // Keep raw events so exports can build day-by-day matrices
  const [rawIns, setRawIns] = useState<any[]>([])
  const [rawOuts, setRawOuts] = useState<any[]>([])
  const [userMeta, setUserMeta] = useState<Record<string, { name: string; project?: string }>>({})

  // Derived: filter rows by employee query for display
  const displayedRows = useMemo(() => {
    const q = (filters.employee || '').toLowerCase().trim()
    // Only include users with actual worked data
    const withData = rows.filter(r => (r.daysWorked || 0) > 0 || (r.totalHours || 0) > 0)
    if (!q) return withData
    return withData.filter(r => (r.employee || '').toLowerCase().includes(q))
  }, [rows, filters.employee])

  // Helpers
  const parseTimeToDate = (timeStr?: string | null, dateStr?: string): Date | null => {
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

  const getDateRange = () => {
    // Default to current month if no filters
    if (filters.startDate && filters.endDate) return { start: filters.startDate, end: filters.endDate }
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
  }

  const fetchReport = async () => {
    setLoading(true)
    setError(null)
    try {
      const { start, end } = getDateRange()

      // 1) Load users
      const { data: users, error: userErr } = await supabase
        .from('user')
        .select('id, name, user_name')
      if (userErr) throw userErr

      // We'll initially keep all users; we'll narrow after loading schedules/ins/outs
      let filteredUsers = (users || []).filter((u: any) =>
        !filters.employee || (u.name || '').toLowerCase().includes(filters.employee.toLowerCase())
      )

      // 2) Load schedules for range to get shift_name per user (load all, we'll filter per user/date)
      const { data: schedules } = await supabase
        .from('schedule')
        .select('user_name, shift_name, project, start_date, end_date, employee_name')

      // 3) Load templates (shift start times)
      const { data: templates } = await supabase
        .from('template')
        .select('shift_name, start_time, end_time, days, break_time')

      // 4) Load all clock-ins/outs in range for all users
      const { data: ins } = await supabase
        .from('clock_in')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end + 'T23:59:59')

      const { data: outs } = await supabase
        .from('clock_out')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end + 'T23:59:59')

      // Restrict users to those who have either:
      // - any active schedule in the range, or
      // - any clock activity in the range
      const activeUserNames = new Set<string>()
      for (const s of schedules || []) {
        const sd = s.start_date ? new Date(s.start_date) : null
        const ed = s.end_date ? new Date(s.end_date) : null
        const rangeOverlaps = (!sd || new Date(end) >= sd) && (!ed || new Date(start) <= ed)
        if (rangeOverlaps && s.user_name) activeUserNames.add(s.user_name)
      }
      for (const ci of ins || []) if (ci.user_name) activeUserNames.add(ci.user_name)
      for (const co of outs || []) if (co.user_name) activeUserNames.add(co.user_name)

      filteredUsers = filteredUsers.filter((u: any) => activeUserNames.has(u.user_name))

      const rows: ReportRow[] = []
      const meta: Record<string, { name: string; project?: string }> = {}

      for (const u of filteredUsers) {
        const uname = u.user_name
        const name = u.name || uname
        meta[uname] = { name }

        const userIns = (ins || []).filter((r: any) => r.user_name === uname)
        const userOuts = (outs || []).filter((r: any) => r.user_name === uname)

        // All schedules for this user (we will evaluate per-day)
        const userSchedules = (schedules || []).filter((s: any) => s.user_name === uname)

        // Map date => {in, out}
        const byDate = new Map<string, { in?: any; out?: any }>()
        for (const ci of userIns) {
          const d = new Date(ci.created_at).toISOString().split('T')[0]
          byDate.set(d, { ...(byDate.get(d) || {}), in: ci })
        }
        for (const co of userOuts) {
          const d = new Date(co.created_at).toISOString().split('T')[0]
          byDate.set(d, { ...(byDate.get(d) || {}), out: co })
        }

        let daysWorked = 0
        let totalMinutes = 0
        let lateCount = 0
        let absences = 0

        // Build list of all dates in range
        const startDate = new Date(start)
        const endDate = new Date(end)
        const today = new Date()
        today.setHours(0,0,0,0)
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          // Do not count future days as absences
          const dMid = new Date(d)
          dMid.setHours(0,0,0,0)
          if (dMid > today) continue
          const dateStr = d.toISOString().split('T')[0]
          const pair = byDate.get(dateStr)
          // Active schedule for this specific date
          const activeSched = userSchedules.find((s: any) => {
            const sd = s.start_date ? new Date(s.start_date) : null
            const ed = s.end_date ? new Date(s.end_date) : null
            const dayOk = (!sd || new Date(dateStr) >= sd) && (!ed || new Date(dateStr) <= ed)
            return dayOk
          })
          const activeTmpl = activeSched ? (templates || []).find((t: any) => t.shift_name === activeSched.shift_name) : null
          const daysStr = String(activeTmpl?.days || '').toLowerCase()
          const weekday = d.getDay() // 0=Sun..6=Sat
          const map = ['sun','mon','tue','wed','thu','fri','sat']
          const isScheduledWorkday = !!activeSched && daysStr.includes(map[weekday])

          if (pair?.in) {
            daysWorked += 1
            const inTime = parseTimeToDate(pair.in.clockIn, dateStr) || new Date(pair.in.created_at)
            const outTime = pair.out ? (parseTimeToDate(pair.out.clockOut, dateStr) || new Date(pair.out.created_at)) : null
            if (outTime) {
              const mins = Math.max(0, Math.floor((outTime.getTime() - inTime.getTime()) / 60000))
              let breakMin = 0
              if (pair.in.startBreak && pair.in.endBreak) {
                const b1 = parseTimeToDate(pair.in.startBreak, dateStr)
                const b2 = parseTimeToDate(pair.in.endBreak, dateStr)
                if (b1 && b2) breakMin = Math.max(0, Math.floor((b2.getTime() - b1.getTime()) / 60000))
              }
              totalMinutes += Math.max(0, mins - breakMin)
            }
            // Late detection vs template start_time if available
            if (activeTmpl?.start_time) {
              const baseline = parseTimeToDate(String(activeTmpl.start_time), dateStr)
              if (baseline && inTime > baseline) lateCount += 1
            }
          } else if (isScheduledWorkday) {
            // Absence only if there is an active schedule on this date and it is a workday per template
            absences += 1
          }
        }

        rows.push({
          id: String(u.id),
          employee: name,
          project: (userSchedules[userSchedules.length - 1]?.project) || '—',
          daysWorked,
          totalHours: Math.round((totalMinutes / 60) * 10) / 10,
          lateCount,
          absences,
          userName: uname,
        })
      }

      setRows(rows)
      setRawIns(ins || [])
      setRawOuts(outs || [])
      setUserMeta(meta)
    } catch (e: any) {
      setError(e?.message || 'Failed to load report')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helpers for export
  const listDates = (startISO: string, endISO: string) => {
    const out: string[] = []
    const s = new Date(startISO)
    const e = new Date(endISO)
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      out.push(new Date(d).toISOString().split('T')[0])
    }
    return out
  }

  const calcDayHours = (uname: string, dateISO: string): number => {
    const ins = rawIns.filter(r => r.user_name === uname && r.created_at.startsWith(dateISO))
    const outs = rawOuts.filter(r => r.user_name === uname && r.created_at.startsWith(dateISO))
    if (ins.length === 0) return 0
    // Pair the first in with the nearest out on same date
    const ci = ins[0]
    const co = outs[0]
    const inDt = parseTimeToDate(ci.clockIn, dateISO) || new Date(ci.created_at)
    const outDt = co ? (parseTimeToDate(co.clockOut, dateISO) || new Date(co.created_at)) : null
    if (!inDt || !outDt || outDt <= inDt) return 0
    let mins = Math.floor((outDt.getTime() - inDt.getTime())/60000)
    // Subtract break if both exist on clock_in
    if (ci.startBreak && ci.endBreak) {
      const b1 = parseTimeToDate(ci.startBreak, dateISO)
      const b2 = parseTimeToDate(ci.endBreak, dateISO)
      if (b1 && b2 && b2 > b1) mins -= Math.max(0, Math.floor((b2.getTime()-b1.getTime())/60000))
    }
    return Math.max(0, Math.round((mins/60) * 100) / 100)
  }

  const weekEndingFriday = (dateISO: string) => {
    const d = new Date(dateISO)
    const day = d.getDay() // 0..6
    const delta = (5 - day + 7) % 7 // days to next Friday (5)
    const end = new Date(d)
    end.setDate(d.getDate() + delta)
    return end.toISOString().split('T')[0]
  }

  // CSV export removed per request

  const handleExportXml = () => {
    // Excel SpreadsheetML (.xls)
    const { start, end } = getDateRange()
    const allDates = listDates(start, end)
    // Group dates by week ending (Friday)
    const weeks = new Map<string, string[]>()
    for (const dt of allDates) {
      const wk = weekEndingFriday(dt)
      const arr = weeks.get(wk) || []
      arr.push(dt)
      weeks.set(wk, arr)
    }

    const weekdayIndex = (iso: string) => new Date(iso).getDay()
    const dayNum = (iso: string) => new Date(iso).getDate()
    const isoOf = (d: Date) => d.toISOString().split('T')[0]
    const esc = (s: string) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')

    const xl = (s: string) => `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n` +
      `<Styles>` +
        `<Style ss:ID="title"><Alignment ss:Horizontal="Center"/><Font ss:Bold="1" ss:Size="16"/></Style>` +
        `<Style ss:ID="hdr"><Alignment ss:Horizontal="Center" ss:WrapText="1"/><Font ss:Bold="1"/></Style>` +
        `<Style ss:ID="textWrap"><Alignment ss:WrapText="1"/><Font/></Style>` +
      `</Styles>\n` +
      `${s}\n</Workbook>`

    // Start building table
    let tableRows = ''
    tableRows += `<Row><Cell ss:MergeAcross="8" ss:StyleID="title"><Data ss:Type="String">PUBLIC WORK HOURS</Data></Cell></Row>`
    tableRows += `<Row/>`

    for (const [weekEnd, dates] of weeks) {
      // Build Mon..Fri from weekEnd (Friday), and Sat/Sun as +1/+2
      const fri = new Date(weekEnd)
      const mon = new Date(fri); mon.setDate(fri.getDate() - 4)
      const tue = new Date(fri); tue.setDate(fri.getDate() - 3)
      const wed = new Date(fri); wed.setDate(fri.getDate() - 2)
      const thu = new Date(fri); thu.setDate(fri.getDate() - 1)
      const sat = new Date(fri); sat.setDate(fri.getDate() + 1)
      const sun = new Date(fri); sun.setDate(fri.getDate() + 2)
      const daysISO = {
        1: isoOf(mon),
        2: isoOf(tue),
        3: isoOf(wed),
        4: isoOf(thu),
        5: isoOf(fri),
        6: isoOf(sat),
        0: isoOf(sun),
      } as Record<number,string>

      // Helper to check if user has any clock-in on a date
      const hasIn = (uname: string, dateISO: string) => rawIns.some(r => r.user_name === uname && r.created_at.startsWith(dateISO))

      // Skip weeks where all visible employees have 0 total (hours) and no clock-in for Mon–Fri
      let anyData = false
      for (const r of displayedRows) {
        const uname = r.userName || ''
        const m = calcDayHours(uname, daysISO[1]) || (hasIn(uname, daysISO[1]) ? 1 : 0)
        const t = calcDayHours(uname, daysISO[2]) || (hasIn(uname, daysISO[2]) ? 1 : 0)
        const w = calcDayHours(uname, daysISO[3]) || (hasIn(uname, daysISO[3]) ? 1 : 0)
        const th = calcDayHours(uname, daysISO[4]) || (hasIn(uname, daysISO[4]) ? 1 : 0)
        const f = calcDayHours(uname, daysISO[5]) || (hasIn(uname, daysISO[5]) ? 1 : 0)
        if (m + t + w + th + f > 0) { anyData = true; break }
      }
      if (!anyData) continue

      const weekStr = new Date(weekEnd).toLocaleDateString('en-US')
      // Column headers (Mon–Fri only)
      tableRows += `<Row>` + ['Month','Week Ending','Project Name/Address','M','T','W','Th','F','Total']
        .map(h => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('') + `</Row>`

      // Group by project from visible rows
      const byProject = new Map<string, ReportRow[]>()
      for (const r of displayedRows) {
        const key = r.project || '—'
        const arr = byProject.get(key) || []
        arr.push(r)
        byProject.set(key, arr)
      }

      for (const [projectName, people] of byProject) {
        // Project heading: month, week ending, project, day numbers
        const monthStr = new Date(weekEnd).toLocaleDateString('en-US', { month: 'long' })
        const dayCells = Array(6).fill('')
        const projRow = [monthStr, weekStr, projectName, ...dayCells]
        tableRows += `<Row>` + projRow.map(v => `<Cell ss:StyleID="textWrap"><Data ss:Type="String">${esc(String(v))}</Data></Cell>`).join('') + `</Row>`

        for (const r of people) {
          const uname = r.userName || ''
          const m = calcDayHours(uname, daysISO[1]) || (hasIn(uname, daysISO[1]) ? 1 : 0)
          const t = calcDayHours(uname, daysISO[2]) || (hasIn(uname, daysISO[2]) ? 1 : 0)
          const w = calcDayHours(uname, daysISO[3]) || (hasIn(uname, daysISO[3]) ? 1 : 0)
          const th = calcDayHours(uname, daysISO[4]) || (hasIn(uname, daysISO[4]) ? 1 : 0)
          const f = calcDayHours(uname, daysISO[5]) || (hasIn(uname, daysISO[5]) ? 1 : 0)
          const total = m + t + w + th + f
          if (total <= 0) continue
          const row = ['', '', r.employee || '—', String(m || ''), String(t || ''), String(w || ''), String(th || ''), String(f || ''), String(total)]
          tableRows += `<Row>` + row.map(v => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`).join('') + `</Row>`
        }

        tableRows += `<Row/>`
      }
    }

    // Columns widths
    const columns = [
      `<Column ss:AutoFitWidth="1" ss:Width="70"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="90"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="220"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="35"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="35"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="35"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="35"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="35"/>`,
      `<Column ss:AutoFitWidth="1" ss:Width="60"/>`,
    ].join('')

    const worksheet = `<Worksheet ss:Name="PublicWorkHours"><Table>${columns}${tableRows}</Table></Worksheet>`
    const xml = xl(worksheet)

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'public_work_hours.xls'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 md:space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Reports</h2>
          <p className="text-sm md:text-base text-muted-foreground">Generate and export attendance reports</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportXml} className="w-full sm:w-auto" disabled={loading}>
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filters card removed; Employee search moved to Attendance Report header */}

      {/* Loading state */}
      {loading && (
        <Card className="rounded-xl md:rounded-2xl">
          <CardContent className="py-16 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading report…</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {!loading && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="rounded-xl md:rounded-2xl">
          <CardHeader className="pb-2 px-3 md:px-6">
            <CardTitle className="text-xs md:text-sm font-medium">Total Employees</CardTitle>
          </CardHeader>
          <CardContent className="px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>

        <Card className="rounded-xl md:rounded-2xl">
          <CardHeader className="pb-2 px-3 md:px-6">
            <CardTitle className="text-xs md:text-sm font-medium">Total Hours</CardTitle>
          </CardHeader>
          <CardContent className="px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold">
              {rows.reduce((sum, emp) => sum + (emp.totalHours || 0), 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl md:rounded-2xl">
          <CardHeader className="pb-2 px-3 md:px-6">
            <CardTitle className="text-xs md:text-sm font-medium">Late Incidents</CardTitle>
          </CardHeader>
          <CardContent className="px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold text-yellow-600">
              {rows.reduce((sum, emp) => sum + (emp.lateCount || 0), 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl md:rounded-2xl">
          <CardHeader className="pb-2 px-3 md:px-6">
            <CardTitle className="text-xs md:text-sm font-medium">Absences</CardTitle>
          </CardHeader>
          <CardContent className="px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold text-red-600">
              {rows.reduce((sum, emp) => sum + (emp.absences || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Report Table */}
      {!loading && (
      <Card className="rounded-xl md:rounded-2xl">
        <CardHeader className="px-3 md:px-6">
          <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base md:text-lg">Attendance Report</CardTitle>
            <div className="grid grid-cols-1 gap-2 items-end lg:items-center w-full lg:w-80">
              <Input
                placeholder="Search employee..."
                value={filters.employee}
                onChange={(e) => setFilters({ ...filters, employee: e.target.value })}
                className="rounded-full h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          {/* Mobile list (no side scroll) */}
          <div className="block md:hidden px-3 space-y-2">
            {displayedRows.map((row) => (
              <div key={row.id} className="rounded-xl border p-3 bg-background" onClick={() => {
                const params = new URLSearchParams()
                if (filters.startDate) params.set('start', filters.startDate)
                if (filters.endDate) params.set('end', filters.endDate)
                const qs = params.toString() ? `?${params.toString()}` : ''
                navigate(`/admin/reports/${encodeURIComponent(row.userName || row.employee)}` + qs)
              }}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">{row.employee}</div>
                  <div className="text-xs text-muted-foreground">{row.project}</div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Days</div><div className="font-medium">{row.daysWorked}</div></div>
                  <div><div className="text-muted-foreground">Hours</div><div className="font-medium">{row.totalHours}h</div></div>
                  <div><div className="text-muted-foreground">Late</div><div className="font-medium">{row.lateCount}</div></div>
                  <div className="text-right"><Badge className="text-[10px]" variant={row.lateCount === 0 && row.absences === 0 ? 'success' : (row.lateCount <= 2 && row.absences <= 1 ? 'secondary' : 'warning')}>{row.lateCount === 0 && row.absences === 0 ? 'Excellent' : (row.lateCount <= 2 && row.absences <= 1 ? 'Good' : 'Review')}</Badge></div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Absences: <span className={row.absences > 0 ? 'text-red-600' : ''}>{row.absences}</span></div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 md:p-4 font-medium text-xs md:text-sm">Employee</th>
                  <th className="text-left p-2 md:p-4 font-medium text-xs md:text-sm hidden sm:table-cell">Project</th>
                  <th className="text-right p-2 md:p-4 font-medium text-xs md:text-sm">Days</th>
                  <th className="text-right p-2 md:p-4 font-medium text-xs md:text-sm">Hours</th>
                  <th className="text-right p-2 md:p-4 font-medium text-xs md:text-sm hidden md:table-cell">Late</th>
                  <th className="text-right p-2 md:p-4 font-medium text-xs md:text-sm hidden md:table-cell">Absences</th>
                  <th className="text-right p-2 md:p-4 font-medium text-xs md:text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      const params = new URLSearchParams()
                      if (filters.startDate) params.set('start', filters.startDate)
                      if (filters.endDate) params.set('end', filters.endDate)
                      const qs = params.toString() ? `?${params.toString()}` : ''
                      navigate(`/admin/reports/${encodeURIComponent(row.userName || row.employee)}` + qs)
                    }}
                  >
                    <td className="p-2 md:p-4 font-medium text-xs md:text-sm">
                      <div>{row.employee}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">{row.project}</div>
                    </td>
                    <td className="p-2 md:p-4 text-xs md:text-sm hidden sm:table-cell">{row.project}</td>
                    <td className="p-2 md:p-4 text-right text-xs md:text-sm">{row.daysWorked}</td>
                    <td className="p-2 md:p-4 text-right text-xs md:text-sm">{row.totalHours}h</td>
                    <td className="p-2 md:p-4 text-right text-xs md:text-sm hidden md:table-cell">
                      {row.lateCount > 0 ? (
                        <span className="text-yellow-600">{row.lateCount}</span>
                      ) : (
                        row.lateCount
                      )}
                    </td>
                    <td className="p-2 md:p-4 text-right text-xs md:text-sm hidden md:table-cell">
                      {row.absences > 0 ? (
                        <span className="text-red-600">{row.absences}</span>
                      ) : (
                        row.absences
                      )}
                    </td>
                    <td className="p-2 md:p-4 text-right text-xs md:text-sm">
                      {row.lateCount === 0 && row.absences === 0 ? (
                        <Badge variant="success" className="text-xs">Excellent</Badge>
                      ) : row.lateCount <= 2 && row.absences <= 1 ? (
                        <Badge variant="secondary" className="text-xs">Good</Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">Review</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}
