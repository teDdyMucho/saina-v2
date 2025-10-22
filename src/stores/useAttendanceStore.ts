import { create } from 'zustand'

interface AttendanceEvent {
  id: string
  type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end'
  timestamp: Date
  location?: { lat: number; lng: number }
}

interface BreakPeriod {
  startTime: Date
  endTime?: Date
}

interface AttendanceState {
  currentSession: AttendanceEvent | null
  isOnBreak: boolean
  breakPeriods: BreakPeriod[]
  currentBreakStart: Date | null
  clockIn: (location?: { lat: number; lng: number }) => void
  clockOut: () => void
  startBreak: () => void
  endBreak: () => void
  getTotalBreakTime: () => number
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  // ---- Persistence helpers ----
  ...(() => {
    const STORAGE_KEY = 'attendanceStateV1'

    const revive = (raw: any): Pick<AttendanceState, 'currentSession' | 'isOnBreak' | 'breakPeriods' | 'currentBreakStart'> => {
      const reviveDate = (v: any) => (v ? new Date(v) : null)
      const currentSession = raw?.currentSession
        ? {
            ...raw.currentSession,
            timestamp: new Date(raw.currentSession.timestamp),
          }
        : null
      const breakPeriods = Array.isArray(raw?.breakPeriods)
        ? raw.breakPeriods.map((p: any) => ({
            startTime: new Date(p.startTime),
            endTime: p.endTime ? new Date(p.endTime) : undefined,
          }))
        : []
      const currentBreakStart = reviveDate(raw?.currentBreakStart) as Date | null
      return {
        currentSession,
        isOnBreak: !!raw?.isOnBreak,
        breakPeriods,
        currentBreakStart,
      }
    }

    let initial = {
      currentSession: null as AttendanceState['currentSession'],
      isOnBreak: false,
      breakPeriods: [] as AttendanceState['breakPeriods'],
      currentBreakStart: null as AttendanceState['currentBreakStart'],
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) initial = { ...initial, ...revive(JSON.parse(saved)) }
    } catch {}

    const persistNow = (state: AttendanceState) => {
      try {
        const toSave = {
          currentSession: state.currentSession
            ? { ...state.currentSession, timestamp: state.currentSession.timestamp.toISOString() }
            : null,
          isOnBreak: state.isOnBreak,
          breakPeriods: state.breakPeriods.map((p) => ({
            startTime: p.startTime.toISOString(),
            endTime: p.endTime ? p.endTime.toISOString() : undefined,
          })),
          currentBreakStart: state.currentBreakStart ? state.currentBreakStart.toISOString() : null,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
      } catch {}
    }

    // Return the initial slice plus action implementations that persist
    return {
      ...initial,
      clockIn: (location) => {
        set({
          currentSession: {
            id: crypto.randomUUID(),
            type: 'clock_in',
            timestamp: new Date(),
            location,
          },
          isOnBreak: false,
          breakPeriods: [],
          currentBreakStart: null,
        })
        persistNow(get())
      },
      clockOut: () => {
        set({ currentSession: null, isOnBreak: false, breakPeriods: [], currentBreakStart: null })
        persistNow(get())
      },
      startBreak: () => {
        set({ isOnBreak: true, currentBreakStart: new Date() })
        persistNow(get())
      },
      endBreak: () => {
        const state = get()
        if (state.currentBreakStart) {
          set({
            isOnBreak: false,
            breakPeriods: [
              ...state.breakPeriods,
              { startTime: state.currentBreakStart, endTime: new Date() }
            ],
            currentBreakStart: null,
          })
          persistNow(get())
        }
      },
      getTotalBreakTime: () => {
        const state = get()
        let total = 0
        
        // Add completed break periods
        state.breakPeriods.forEach(period => {
          if (period.endTime) {
            total += period.endTime.getTime() - period.startTime.getTime()
          }
        })
        
        // Add current ongoing break if any
        if (state.currentBreakStart) {
          total += Date.now() - state.currentBreakStart.getTime()
        }
        
        return total
      },
    }
  })(),
}))
