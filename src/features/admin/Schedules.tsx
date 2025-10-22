import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, Users, Pencil, Trash } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type ShiftTemplate = {
  id: string
  name: string
  startTime: string
  endTime: string
  breakStart: string
  breakEnd: string
  weekdays: number[]
  projectName?: string
}

// Parse the `days` column (could be a JSON array of names or comma-separated string)
function parseDaysToIndices(days: any): number[] {
  if (!days) return []
  try {
    const parsed = typeof days === 'string' ? JSON.parse(days) : days
    if (Array.isArray(parsed)) {
      return parsed
        .map((d) => {
          const name = String(d).slice(0, 3)
          return weekdayNames.indexOf(name)
        })
        .filter((i) => i >= 0)
    }
  } catch {
    // If not JSON, try comma-separated
    const parts = String(days).split(',').map((s) => s.trim())
    return parts
      .map((p) => weekdayNames.indexOf(p.slice(0, 3)))
      .filter((i) => i >= 0)
  }
  return []
}

// Parse a DB break_time string (e.g. "12:00 pm - 01:00 pm" or "12:00-13:00") into 24h HH:mm range
function parseBreakTo24h(brk?: string | null): { start: string; end: string } {
  if (!brk) return { start: '', end: '' }
  const raw = String(brk).replace(/\s+/g, ' ').trim()
  const parts = raw.split(/-||–|—/).map((p) => p.trim())
  if (parts.length >= 2) {
    return { start: to24h(parts[0]), end: to24h(parts[1]) }
  }
  return { start: '', end: '' }
}

const initialShiftTemplates: ShiftTemplate[] = []

// Assigned schedules mock removed; hook up to Supabase later if needed

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Helper to convert "HH:mm" to 12-hour e.g. "09:00 am"
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

// Helper to convert possible 12-hour strings like "09:00 am" back to "HH:mm" for <input type="time">
function to24h(maybe12h: string): string {
  if (!maybe12h) return ''
  const s = maybe12h.trim().toLowerCase()
  // Already 24h HH:mm
  if (/^\d{2}:\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/)
  if (!m) return ''
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ampm = m[3]
  if (ampm === 'pm' && h !== 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  const hh = h.toString().padStart(2, '0')
  return `${hh}:${min}`
}

// Helper: format YYYY-MM-DD to YYYY/MM/DD
function ymdToSlash(s?: string | null): string | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(s)
  return `${m[1]}/${m[2]}/${m[3]}`
}

export function Schedules() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>(initialShiftTemplates)
  const [editing, setEditing] = useState<ShiftTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({
    id: '',
    name: '',
    projectName: '',
    startTime: '',
    endTime: '',
    breakStart: '',
    breakEnd: '',
    weekdays: [] as number[],
  })
  const [assign, setAssign] = useState({
    employeeId: '',
    projectName: '',
    shiftId: '',
    startDate: '',
    endDate: '',
  })
  // Track editing of an existing schedule row
  const [editingAssignedId, setEditingAssignedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)
  const [templateSubmitting, setTemplateSubmitting] = useState(false)
  const [templateMsg, setTemplateMsg] = useState<string | null>(null)
  const [assigned, setAssigned] = useState<Array<{
    id: string
    employeeName: string
    shiftName: string
    startDate: string
    endDate?: string | null
    recurrence?: string
    details?: {
      startTime: string
      endTime: string
      breakStart: string
      breakEnd: string
      weekdays: string[]
    }
  }>>([])

  // Delete confirmation modal state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteInfo, setConfirmDeleteInfo] = useState<{ employee?: string; shift?: string } | null>(null)

  // Employees from Supabase `user` table
  const [employees, setEmployees] = useState<Array<{ id: number | string; name: string; user_name?: string }>>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [employeesError, setEmployeesError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingEmployees(true)
      setEmployeesError(null)
      const { data, error } = await supabase.from('user').select('id, name, user_name')
      if (error) {
        setEmployeesError('Failed to load employees')
      } else {
        setEmployees((data || []).map((r) => ({ id: r.id as any, name: (r as any).name || 'Unnamed', user_name: (r as any).user_name })))
      }
      setLoadingEmployees(false)
    }
    load()
  }, [])

  const loadSchedules = async (): Promise<void> => {
    const { data, error } = await supabase
      .from('schedule')
      .select('id, employee_name, shift_name, start_date, end_date, created_at')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setAssigned(
        data.map((row: any) => {
          const t = shiftTemplates.find((x) => x.name === row.shift_name)
          return {
            id: String(row.id),
            employeeName: row.employee_name as string,
            shiftName: row.shift_name as string,
            startDate: row.start_date as string,
            endDate: (row.end_date as string) || null,
            recurrence: 'weekly',
            // attach details if found
            details: t
              ? {
                  startTime: t.startTime,
                  endTime: t.endTime,
                  breakStart: t.breakStart,
                  breakEnd: t.breakEnd,
                  weekdays: t.weekdays.map((i) => weekdayNames[i]),
                }
              : undefined,
          }
        })
      )
    }
  }

  useEffect(() => {
    loadSchedules()
  }, [])

  // Hover action handlers for Assigned Schedules
  const editAssigned = (s: {
    id: string
    employeeName: string
    shiftName: string
    startDate: string
    endDate?: string | null
  }) => {
    const emp = employees.find((e) => e.name === s.employeeName)
    const shift = shiftTemplates.find((t) => t.name === s.shiftName)
    setAssign({
      employeeId: emp ? String(emp.id) : '',
      projectName: shift?.projectName || '',
      shiftId: shift ? shift.id : '',
      startDate: s.startDate || '',
      endDate: s.endDate || '',
    })
    setEditingAssignedId(s.id)
    setIsFormOpen(false)
  }

  const deleteAssigned = async (id: string) => {
    // Optimistic UI removal
    const prev = assigned
    setAssigned((list) => list.filter((x) => x.id !== id))
    const { error } = await supabase.from('schedule').delete().eq('id', id)
    if (error) {
      // rollback on failure
      setAssigned(prev)
      console.error('Failed to delete schedule:', error)
      alert('Failed to delete. Please try again.')
    }
  }

  // Load shift templates from Supabase `template` table
  useEffect(() => {
    const loadTemplates = async () => {
      const { data, error } = await supabase
        .from('template')
        .select('id, shift_name, start_time, end_time, break_time, days, project, created_at')

      if (!error && data) {
        const mapped = data.map((row: any) => {
          const weekdays: number[] = parseDaysToIndices(row.days)
          const brk = parseBreakTo24h(row.break_time as string)
          return {
            id: String(row.id),
            name: row.shift_name as string,
            // Normalize for <input type="time">
            startTime: to24h(row.start_time as string) || '',
            endTime: to24h(row.end_time as string) || '',
            breakStart: brk.start,
            breakEnd: brk.end,
            weekdays,
            projectName: (row as any).project || '',
          }
        })
        setShiftTemplates(mapped)
      }
    }
    loadTemplates()
  }, [])

  // Reload schedules when templates change so details can be populated
  useEffect(() => {
    loadSchedules()
  }, [shiftTemplates])

  const openEdit = (tmpl: ShiftTemplate) => {
    setEditing(tmpl)
    setIsCreating(false)
    setForm({
      id: tmpl.id,
      name: tmpl.name,
      projectName: tmpl.projectName || '',
      startTime: tmpl.startTime,
      endTime: tmpl.endTime,
      breakStart: tmpl.breakStart,
      breakEnd: tmpl.breakEnd,
      weekdays: [...tmpl.weekdays],
    })
  }

  const openCreate = () => {
    const newId = `${Date.now()}`
    setIsCreating(true)
    setEditing({
      id: newId,
      name: 'New Shift',
      startTime: '09:00',
      endTime: '18:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      weekdays: [1,2,3,4,5],
      projectName: '',
    })
    setForm({
      id: newId,
      name: 'New Shift',
      projectName: '',
      startTime: '09:00',
      endTime: '18:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      weekdays: [1,2,3,4,5],
    })
  }

  const deleteTemplate = async (id: string) => {
    const prev = shiftTemplates
    const tmpl = prev.find((s) => s.id === id)
    // Optimistic UI
    setShiftTemplates((list) => list.filter((s) => s.id !== id))
    try {
      // Delete from Supabase
      await supabase.from('template').delete().eq('id', id)
      // Notify webhook
      try {
        const payload = {
          id,
          name: tmpl?.name || null,
          projectName: tmpl?.projectName || '',
          startTime: tmpl ? to12h(tmpl.startTime) : null,
          endTime: tmpl ? to12h(tmpl.endTime) : null,
          breakTime: tmpl ? `${to12h(tmpl.breakStart)} - ${to12h(tmpl.breakEnd)}` : null,
          weekdays: tmpl ? tmpl.weekdays.map((i) => weekdayNames[i]) : [],
          action: 'delete' as const,
          createdAt: new Date().toISOString(),
        }
        await fetch('https://primary-production-6722.up.railway.app/webhook/template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch {}
      // Hard refresh from DB to avoid ghost/empty cards
      await (async () => {
        const { data, error } = await supabase
          .from('template')
          .select('id, shift_name, start_time, end_time, break_time, days, project, created_at')
        if (!error && data) {
          const mapped = data.map((row: any) => {
            const weekdays: number[] = parseDaysToIndices(row.days)
            const brk = parseBreakTo24h(row.break_time as string)
            return {
              id: String(row.id),
              name: row.shift_name as string,
              startTime: to24h(row.start_time as string) || '',
              endTime: to24h(row.end_time as string) || '',
              breakStart: brk.start,
              breakEnd: brk.end,
              weekdays,
              projectName: (row as any).project || '',
            }
          })
          setShiftTemplates(mapped)
        }
      })()
    } catch (err) {
      // Rollback UI on error
      setShiftTemplates(prev)
      console.error('Failed to delete template:', err)
      alert('Failed to delete template. Please try again.')
    }
  }

  const toggleWeekday = (i: number) => {
    setForm((f) => {
      const has = f.weekdays.includes(i)
      return { ...f, weekdays: has ? f.weekdays.filter((d) => d !== i) : [...f.weekdays, i] }
    })
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTemplateMsg(null)
    // Update UI state: only optimistically update when editing existing
    if (!isCreating) {
      setShiftTemplates((list) => list.map((s) => (s.id === form.id ? { ...s, ...form } : s)))
    }
    // Send to webhook
    setTemplateSubmitting(true)
    try {
      // Persist to Supabase only for updates. Creation is handled by n8n webhook.
      if (!isCreating) {
        const { error } = await supabase
          .from('template')
          .update({
            shift_name: form.name,
            start_time: to12h(form.startTime),
            end_time: to12h(form.endTime),
            break_time: `${to12h(form.breakStart)} - ${to12h(form.breakEnd)}`,
            days: JSON.stringify(form.weekdays.map((i) => weekdayNames[i])),
            project: form.projectName || '',
          })
          .eq('id', form.id)
        if (error) throw error
      }
      const res = await fetch('https://primary-production-6722.up.railway.app/webhook/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isCreating ? null : form.id,
          clientId: isCreating ? form.id : undefined,
          name: form.name,
          projectName: form.projectName || '',
          startTime: to12h(form.startTime),
          endTime: to12h(form.endTime),
          breakTime: `${to12h(form.breakStart)} - ${to12h(form.breakEnd)}`,
          weekdays: form.weekdays.map((i) => weekdayNames[i]),
          action: isCreating ? 'create' : 'update',
          createdAt: new Date().toISOString(),
        }),
      })
      const text = await res.text().catch(() => '')
      setTemplateMsg(res.ok ? 'Template saved' : `Failed to send: ${text || res.status}`)
      if (res.ok) {
        // After webhook creates the row (n8n), reload from DB to avoid duplicates
        if (isCreating) {
          const { data, error } = await supabase
            .from('template')
            .select('id, shift_name, start_time, end_time, break_time, days, project, created_at')
          if (!error && data) {
            const mapped = data.map((row: any) => {
              const weekdays: number[] = parseDaysToIndices(row.days)
              const brk = parseBreakTo24h(row.break_time as string)
              return {
                id: String(row.id),
                name: row.shift_name as string,
                startTime: to24h(row.start_time as string) || '',
                endTime: to24h(row.end_time as string) || '',
                breakStart: brk.start,
                breakEnd: brk.end,
                weekdays,
                projectName: (row as any).project || '',
              }
            })
            setShiftTemplates(mapped)
          }
        }
        setEditing(null)
        setIsCreating(false)
      }
    } catch (err) {
      setTemplateMsg('Network error')
    } finally {
      setTemplateSubmitting(false)
    }
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitMsg(null)
    if (!assign.employeeId || !assign.projectName || !assign.shiftId || !assign.startDate) {
      setSubmitMsg('Please select employee, project, shift, and start date')
      return
    }
    const shift = shiftTemplates.find((s) => s.id === assign.shiftId)
    const emp = employees.find((x) => String(x.id) === String(assign.employeeId))
    setSubmitting(true)
    try {
      if (editingAssignedId) {
        // Edits are handled by n8n; do not update DB here. Continue to send webhook below.
      } else {
        // Creation is handled by n8n via webhook; do not insert into Supabase here
      }
      // Send to schedule webhook
      try {
        const payload = {
          id: editingAssignedId ?? null,
          action: editingAssignedId ? 'update' as const : 'create' as const,
          employeeName: emp?.name || null,
          user_name: emp?.user_name || null,
          projectName: assign.projectName || '',
          shiftName: shift?.name || null,
          startDate: ymdToSlash(assign.startDate),
          endDate: ymdToSlash(assign.endDate) || null,
          details: shift
            ? {
                startTime: to12h(shift.startTime),
                endTime: to12h(shift.endTime),
                breakTime: `${to12h(shift.breakStart)} - ${to12h(shift.breakEnd)}`,
                weekdays: shift.weekdays.map((i) => weekdayNames[i]),
              }
            : null,
          createdAt: new Date().toISOString(),
        }
        await fetch('https://primary-production-6722.up.railway.app/webhook/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch {}
      if (!editingAssignedId) {
        setSubmitMsg('Schedule assigned')
        await loadSchedules()
      }
      // For edits, just close—n8n will handle persistence and any UI refresh can be manual
      setAssign({ employeeId: '', projectName: '', shiftId: '', startDate: '', endDate: '' })
      setEditingAssignedId(null)
      setIsFormOpen(false)
    } catch (err: any) {
      console.error('Assign/save schedule error:', err)
      setSubmitMsg('Failed to save schedule')
    } finally {
      setSubmitting(false)
    }
  }

  // Distinct list of projects from templates
  const projectOptions = Array.from(new Set(shiftTemplates.map((t) => t.projectName || '').filter(Boolean)))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Schedules</h2>
          <p className="text-muted-foreground">Manage shift templates and employee schedules</p>
        </div>
        {/* New Schedule button moved to Assigned Schedules section */}
      </div>

      {/* Shift Templates */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Shift Templates</h3>
          <Button size="sm" onClick={openCreate}>Add Template</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shiftTemplates.map((shift) => (
            <Card key={shift.id} className="group">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    {shift.projectName ? (
                      <>
                        <CardTitle className="text-lg">{shift.projectName}</CardTitle>
                        <div className="text-sm text-muted-foreground mt-0.5">{shift.name}</div>
                      </>
                    ) : (
                      <CardTitle className="text-lg">{shift.name}</CardTitle>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => openEdit(shift)}
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit template"
                      aria-label="Edit template"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => deleteTemplate(shift.id)}
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete template"
                      aria-label="Delete template"
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {to12h(shift.startTime)} - {to12h(shift.endTime)}
                  </span>
                </div>
                
                <div className="text-sm">
                  <p className="text-muted-foreground">
                    Break: {to12h(shift.breakStart)} - {to12h(shift.breakEnd)}
                  </p>
                </div>

                <div className="flex gap-1 flex-wrap">
                  {weekdayNames.map((day, index) => (
                    <Badge
                      key={index}
                      variant={shift.weekdays.includes(index) ? 'default' : 'outline'}
                      className="text-xs"
                    >
                      {day}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Assigned Schedules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Assigned Schedules</h3>
          <Button onClick={() => { setEditingAssignedId(null); setAssign({ employeeId: '', projectName: '', shiftId: '', startDate: '', endDate: '' }); setIsCreateModalOpen(true) }}>New Schedule</Button>
        </div>
        {assigned.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No schedules to display yet.
            </CardContent>
          </Card>
        ) : (
          assigned.map((s) => (
            <Card key={s.id} className="group relative">
              <CardContent className="pt-6">
                {/* Top-right small icon actions */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => editAssigned(s)} title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 w-7 p-0" onClick={() => { setConfirmDeleteId(s.id); setConfirmDeleteInfo({ employee: s.employeeName, shift: s.shiftName }) }} title="Delete">
                    <Trash className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-2 pr-16">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold">{s.employeeName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        {s.shiftName}
                        {s.details ? ` • ${to12h(s.details.startTime)} - ${to12h(s.details.endTime)}` : ''}
                      </span>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>From {ymdToSlash(s.startDate)}</span>
                      </div>
                    </div>
                    {s.details && (
                      <>
                        <div className="text-sm text-muted-foreground">
                          Break: {to12h(s.details.breakStart)} - {to12h(s.details.breakEnd)}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {s.details.weekdays.map((d) => (
                            <Badge key={d} className="text-xs">{d}</Badge>
                          ))}
                        </div>
                      </>
                    )}

      {/* Edit Assigned Schedule Modal */}
      {editingAssignedId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Edit Assigned Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleAssign}>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Employee</label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={assign.employeeId}
                    onChange={(e) => setAssign((a) => ({ ...a, employeeId: e.target.value }))}
                    disabled
                  >
                    <option value="">{loadingEmployees ? 'Loading...' : 'Select employee'}</option>
                    {employees.map((e) => (
                      <option key={e.id} value={String(e.id)}>{e.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Employee cannot be changed for an existing assignment.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Project</label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={assign.projectName}
                    onChange={(e) => setAssign((a) => ({ ...a, projectName: e.target.value, shiftId: '' }))}
                  >
                    <option value="">Select project</option>
                    {projectOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Shift Template</label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={assign.shiftId}
                    onChange={(e) => setAssign((a) => ({ ...a, shiftId: e.target.value }))}
                  >
                    <option value="">Select shift</option>
                    {shiftTemplates
                      .filter((shift) => (assign.projectName ? (shift.projectName || '') === assign.projectName : true))
                      .map((shift) => (
                        <option key={shift.id} value={shift.id}>{shift.name}</option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Date</label>
                    <Input type="date" value={assign.startDate} onChange={(e) => setAssign((a) => ({ ...a, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Date (Optional)</label>
                    <Input type="date" value={assign.endDate} onChange={(e) => setAssign((a) => ({ ...a, endDate: e.target.value }))} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setEditingAssignedId(null); setSubmitMsg(null) }}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Changes'}</Button>
                </div>
                {submitMsg && <p className="text-xs text-muted-foreground mt-2">{submitMsg}</p>}
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Delete Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Are you sure you want to delete this schedule{confirmDeleteInfo?.employee ? ` for ${confirmDeleteInfo.employee}` : ''}{confirmDeleteInfo?.shift ? ` (${confirmDeleteInfo.shift})` : ''}? This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setConfirmDeleteId(null); setConfirmDeleteInfo(null) }}>Cancel</Button>
                <Button variant="destructive" onClick={async () => { const id = confirmDeleteId; setConfirmDeleteId(null); setConfirmDeleteInfo(null); if (id) await deleteAssigned(id) }}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
                  </div>
                  <Badge variant="secondary">{s.recurrence || 'weekly'}</Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Assigned Schedule Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Assign New Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={async (e) => { await handleAssign(e); if (!submitting) setIsCreateModalOpen(false) }}>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Employee</label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={assign.employeeId}
                    onChange={(e) => setAssign((a) => ({ ...a, employeeId: e.target.value }))}
                  >
                    <option value="">{loadingEmployees ? 'Loading...' : 'Select employee'}</option>
                    {employees.map((e) => (
                      <option key={e.id} value={String(e.id)}>{e.name}</option>
                    ))}
                  </select>
                  {employeesError && (
                    <p className="text-xs text-red-600 mt-1">{employeesError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Project</label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={assign.projectName}
                    onChange={(e) => setAssign((a) => ({ ...a, projectName: e.target.value, shiftId: '' }))}
                  >
                    <option value="">Select project</option>
                    {projectOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Shift Template</label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={assign.shiftId}
                    onChange={(e) => setAssign((a) => ({ ...a, shiftId: e.target.value }))}
                  >
                    <option value="">Select shift</option>
                    {shiftTemplates
                      .filter((shift) => (assign.projectName ? (shift.projectName || '') === assign.projectName : true))
                      .map((shift) => (
                        <option key={shift.id} value={shift.id}>{shift.name}</option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Date</label>
                    <Input type="date" value={assign.startDate} onChange={(e) => setAssign((a) => ({ ...a, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Date (Optional)</label>
                    <Input type="date" value={assign.endDate} onChange={(e) => setAssign((a) => ({ ...a, endDate: e.target.value }))} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsCreateModalOpen(false); setSubmitMsg(null) }}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Assign Schedule'}</Button>
                </div>
                {submitMsg && <p className="text-xs text-muted-foreground mt-2">{submitMsg}</p>}
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Template Modal (simple overlay) */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Edit Shift Template</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveEdit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Project Name</label>
                  <Input value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} placeholder="Optional" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Time</label>
                    <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Time</label>
                    <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Break Start</label>
                    <Input type="time" value={form.breakStart} onChange={(e) => setForm({ ...form, breakStart: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Break End</label>
                    <Input type="time" value={form.breakEnd} onChange={(e) => setForm({ ...form, breakEnd: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Weekdays</label>
                  <div className="flex gap-1 flex-wrap">
                    {weekdayNames.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleWeekday(i)}
                        className={`px-2 py-1 rounded border text-xs ${form.weekdays.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={templateSubmitting}>Cancel</Button>
                  <Button type="submit" disabled={templateSubmitting}>{templateSubmitting ? 'Saving...' : 'Save'}</Button>
                </div>
                {templateMsg && <p className="text-xs text-muted-foreground">{templateMsg}</p>}
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
