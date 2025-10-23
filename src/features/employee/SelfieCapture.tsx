import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAttendanceStore } from '@/stores/useAttendanceStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/LoadingSpinner'

export default function SelfieCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [placeName, setPlaceName] = useState<string | null>(null)
  const [locLoading, setLocLoading] = useState<boolean>(false)
  const [sending, setSending] = useState<boolean>(false)
  const { user } = useAuthStore()
  const clockOutStore = useAttendanceStore((s) => s.clockOut)

  // Read pending action to customize UI
  const pendingAction = (localStorage.getItem('pendingAction') as any) as 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut' | null
  const actionLabel = 
    pendingAction === 'startBreak' ? 'Start Break' :
    pendingAction === 'endBreak' ? 'End Break' :
    pendingAction === 'clockOut' ? 'Clock Out' :
    'Clock In'

  // Actively request geolocation and resolve a human-readable place name
  async function requestLocationAndName(): Promise<{ lat: number; lng: number } | null> {
    if (locLoading) return null
    setLocLoading(true)
    if (!('geolocation' in navigator)) {
      setError((prev) => (prev ? prev + ' Location unsupported.' : 'Location unsupported.'))
      setLocLoading(false)
      return null
    }

    const getWith = (opts: PositionOptions) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        let timer: any = setTimeout(() => reject(new Error('getCurrentPosition timeout')), (opts.timeout || 15000) + 500)
        navigator.geolocation.getCurrentPosition(
          (p) => { clearTimeout(timer); resolve(p) },
          (e) => { clearTimeout(timer); reject(e) },
          opts
        )
      })

    const watchOnce = (opts: PositionOptions) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        const id = navigator.geolocation.watchPosition(
          (p) => {
            clearTimeout(timer)
            navigator.geolocation.clearWatch(id)
            resolve(p)
          },
          (err) => {
            clearTimeout(timer)
            navigator.geolocation.clearWatch(id)
            reject(err)
          },
          opts
        )
        const timer: any = setTimeout(() => {
          navigator.geolocation.clearWatch(id)
          reject(new Error('watchPosition timeout'))
        }, (opts.timeout || 15000) + 500)
      })

    try {
      let pos: GeolocationPosition | null = null
      try {
        // Try fast high-accuracy first
        pos = await getWith({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
      } catch (e) {
        // Fall back: take first update from watch or low-accuracy getCurrentPosition
        try {
          pos = await Promise.race([
            watchOnce({ enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }),
            getWith({ enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }),
          ])
        } catch {
          // Last resort: retry high-accuracy with longer timeout
          pos = await getWith({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
        }
      }

      if (!pos) throw new Error('No position')
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setCoords(c)
      try {
        const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${c.lat}&longitude=${c.lng}&localityLanguage=en`)
        const d = await r.json()
        let composed = composePlaceName(d)
        // Try OSM Nominatim as a fallback to get street if missing
        try {
          const nomiRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c.lat}&lon=${c.lng}&addressdetails=1`)
          const nomi = await nomiRes.json()
          const a = nomi?.address || {}
          const house = a.house_number || a.house_name || ''
          const road = a.road || a.residential || a.path || a.pedestrian || a.footway || ''
          const barangay = a.suburb || a.neighbourhood || a.village || a.hamlet || a.quarter || a.district || ''
          const city = a.city || a.town || a.municipality || a.county || ''
          const province = a.state || a.province || ''
          const country = a.country || ''
          const street = [house, road].filter(Boolean).join(' ').trim()
          const parts: string[] = []
          if (street) parts.push(street)
          else if (barangay) parts.push(barangay)
          if (city) parts.push(city)
          if (province) parts.push(province)
          if (country) parts.push(country)
          const human = parts.join(', ')
          const title = (s: string) => s.replace(/\b([a-z])(\w*)/gi, (m, a, b) => `${String(a).toUpperCase()}${b.toLowerCase()}`)
          if (human) {
            // Prefer Nominatim result if it has a street or barangay more specific than the existing composed value
            const preferNominatim = Boolean(street) || (barangay && (!composed || /^\w+,\s*\w+\s*,\s*\w+/.test(human)))
            if (preferNominatim) composed = title(human)
          }
        } catch {}
        setPlaceName(composed)
      } catch {}
      setLocLoading(false)
      return c
    } catch (e) {
      setError('Waiting for location... please enable location and try again or tap Get Location.')
      setLocLoading(false)
      return null
    }
  }

  useEffect(() => {
    const start = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        setStream(s)
        if (videoRef.current) {
          videoRef.current.srcObject = s
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        setError('Camera permission denied or unavailable.')
      }

      await requestLocationAndName()
    }
    start()
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const w = videoRef.current.videoWidth || 640
    const h = videoRef.current.videoHeight || 480
    const c = canvasRef.current
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(videoRef.current, 0, 0, w, h)
    const dataUrl = c.toDataURL('image/jpeg', 0.8)
    setCaptured(dataUrl)
    // Pause preview to freeze the frame after capture
    try { videoRef.current.pause() } catch {}
  }

  const retake = () => {
    setCaptured(null)
  }

  // When leaving captured state, the <video> remounts. Ensure it resumes playback.
  useEffect(() => {
    if (!captured && videoRef.current && stream) {
      try {
        // Re-attach stream in case the element remounted
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream
        }
        videoRef.current.play().catch(() => {})
      } catch {}
    }
  }, [captured, stream])

  const composePlaceName = (d: any) => {
    const admin = d?.localityInfo?.administrative || []
    const info = d?.localityInfo?.informative || []
    const getByDesc = (list: any[], re: RegExp) => list.find((x: any) => re.test((x?.description || '').toLowerCase()))?.name
    const findAdmin = (re: RegExp) => admin.find((x: any) => re.test(((x?.description || '') + ' ' + (x?.name || '')).toLowerCase()))?.name

    // Street and house number (if available)
    const road = getByDesc(info, /(road|street|st\b|route|highway|hwy|drive|dr\b|avenue|ave\b|blvd|lane|ln\b|way|circle|cir\b|court|ct\b)/i)
    const houseNumber = getByDesc(info, /(house\s*number|address|addr(ess)?\s*line\s*1?)/i)

    // City / locality
    const city = d?.locality || d?.city || findAdmin(/city|municipality|town/)

    // Province / state and 2-letter code when available
    const principal = d?.principalSubdivision as string | undefined
    const countryCode = (d?.countryCode || '').toUpperCase()
    let province = principal || findAdmin(/province|state/)
    if (province && /region/i.test(province)) {
      const provFromAdmin = findAdmin(/province|state/)
      if (provFromAdmin) province = provFromAdmin
    }
    const provCodeRaw = d?.principalSubdivisionCode as string | undefined // e.g., US-CA, PH-03
    let provCode = provCodeRaw ? provCodeRaw.split('-').pop() : undefined
    // Use province code only for US/CA; otherwise prefer the full province/state name
    if (!['US', 'CA'].includes(countryCode)) {
      provCode = undefined
    }

    // Country
    let country = (d?.countryName || '').replace(/\s*\(the\)\s*/i, '').trim()

    // If no street, try smaller localities like barangay/suburb/neighbourhood
    const barangayOrSuburb = getByDesc(info, /(barangay|suburb|neighbourhood|neighborhood|village|hamlet|district|quarter)/i)

    // Sanitize helper to avoid continent names leaking into address
    const sanitize = (s?: string) => {
      if (!s) return undefined
      const v = String(s).trim()
      if (/^(asia|europe|africa|north\s+america|south\s+america|antarctica|oceania|australia)$/i.test(v)) return undefined
      return v
    }

    const cleanStreet = sanitize([houseNumber, road].filter(Boolean).join(' '))
    const cleanBarangay = sanitize(barangayOrSuburb)
    const cleanCity = sanitize(city)
    const cleanProvince = sanitize(provCode || province)
    const cleanCountry = sanitize(country) || country

    // Build parts with desired formatting
    const parts: string[] = []
    if (cleanStreet) {
      parts.push(cleanStreet)
    } else if (cleanBarangay) {
      parts.push(cleanBarangay)
    }
    if (cleanCity) parts.push(cleanCity)
    if (cleanProvince) parts.push(cleanProvince)
    if (cleanCountry) parts.push(cleanCountry)

    const human = parts.join(', ')

    // Title-case words except short stopwords
    const title = (s: string) => s.replace(/\b([a-z])(\w*)/gi, (m, a, b) => `${String(a).toUpperCase()}${b.toLowerCase()}`)
      .replace(/\b(And|Of|The|De|La|Da|Di|Del)\b/g, (w) => w.toLowerCase())
      .replace(/United States Of America/i, 'USA')

    return title(human) || d?.plusCode || city || province || country || null
  }

  const formatTime12h = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0')
    let h = d.getHours()
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    if (h === 0) h = 12
    const hh = h.toString().padStart(2, '0')
    const mins = pad(d.getMinutes())
    return `${hh}:${mins} ${ampm}`
  }

  const saveAndClose = async () => {
    if (sending) return
    setSending(true)
    const current = coords || (await requestLocationAndName())
    if (!current) {
      setError('Waiting for location... please enable location and try again.')
      setSending(false)
      return
    }
    // Resolve current shift data (schedule + template)
    const resolveUserName = async (): Promise<string | null> => {
      try {
        if (!user?.name) return user?.email || null
        const { data } = await supabase
          .from('user')
          .select('user_name')
          .eq('name', user.name)
          .maybeSingle()
        return (data as any)?.user_name || user?.email || null
      } catch {
        return user?.email || null
      }
    }

    const parseDaysToNames = (days: any): string[] => {
      if (!days) return []
      try {
        const parsed = typeof days === 'string' ? JSON.parse(days) : days
        if (Array.isArray(parsed)) return parsed.map((d) => String(d).slice(0,3))
      } catch {
        return String(days)
          .split(',')
          .map((s) => s.trim().slice(0,3))
          .filter(Boolean)
      }
      return []
    }

    const to12h = (s?: string) => {
      if (!s) return ''
      const str = String(s).trim().toLowerCase()
      if (/^\d{2}:\d{2}$/.test(str)) {
        const [hStr, mStr] = str.split(':')
        let h = parseInt(hStr, 10)
        const ampm = h >= 12 ? 'pm' : 'am'
        h = h % 12
        if (h === 0) h = 12
        const hh = h.toString().padStart(2,'0')
        return `${hh}:${mStr} ${ampm}`
      }
      const m = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/)
      if (!m) return s
      return `${m[1].padStart(2,'0')}:${m[2]} ${m[3]}`
    }

    const username = await resolveUserName()
    let shiftData: any = null
    try {
      if (username) {
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
        const { data: schedules } = await supabase
          .from('schedule')
          .select('shift_name, project, start_date, end_date, user_name, created_at')
          .eq('user_name', username)
          .order('created_at', { ascending: false })
        const active = (schedules || []).find((s: any) => (!s.start_date || s.start_date <= todayStr) && (!s.end_date || s.end_date >= todayStr)) || (schedules || [])[0]
        if (active?.shift_name) {
          // match template by shift + project, fallback to shift only
          let tmpl: any = null
          {
            const { data } = await supabase
              .from('template')
              .select('start_time, end_time, break_time, days, project')
              .eq('shift_name', active.shift_name)
              .eq('project', active.project)
              .maybeSingle()
            tmpl = data
          }
          if (!tmpl) {
            const { data } = await supabase
              .from('template')
              .select('start_time, end_time, break_time, days, project')
              .eq('shift_name', active.shift_name)
              .maybeSingle()
            tmpl = data
          }
          if (tmpl) {
            shiftData = {
              shiftName: active.shift_name,
              projectName: active.project || (tmpl as any).project || '',
              startTime: to12h((tmpl as any).start_time),
              endTime: to12h((tmpl as any).end_time),
              breakTime: (tmpl as any).break_time || '',
              weekdays: parseDaysToNames((tmpl as any).days),
            }
          }
        }
      }
    } catch {}

    // Fire webhook with current location (and selfie if captured)
    let nameToSend = placeName
    if (!nameToSend) {
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${current.lat}&longitude=${current.lng}&localityLanguage=en`)
        const d = await res.json()
        nameToSend = composePlaceName(d)
      } catch {}
    }
    const pendingAction = (localStorage.getItem('pendingAction') as any) as 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut' | null
    const action: 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut' = pendingAction || 'clockIn'
    const endpoint = action === 'clockOut' 
      ? 'https://primary-production-6722.up.railway.app/webhook/ClockOut'
      : 'https://primary-production-6722.up.railway.app/webhook/clockIn'

    // Generate clockIn_id for new clock-in sessions
    const clockInId = action === 'clockIn' ? crypto.randomUUID() : null
    
    if (clockInId) {
      console.log('Generated clockIn_id:', clockInId)
    }

    const payload = {
      name: nameToSend || `${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}`,
      time: formatTime12h(new Date()),
      image: captured || null,
      location: current,
      employee: user ? { name: user.name, username: user.email, user_name: username } : null,
      shift: shiftData || null,
      action,
      ...(clockInId && { clockIn_id: clockInId }),
    }
    
    console.log('Sending to webhook:', action, 'with clockIn_id:', clockInId)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await res.text().catch(() => '')

      // For Clock Out, wait for "Done" response before navigating
      if (action === 'clockOut') {
        if (res.ok && /done/i.test(text)) {
          // Clear session data on successful clock out
          try { clockOutStore() } catch {}
          localStorage.removeItem('selfieDataUrl')
          localStorage.removeItem('lastGeo')
          localStorage.removeItem('lastAddress')
          localStorage.removeItem('pendingAction')
          if (window.opener) {
            window.close()
          } else {
            window.location.replace('/employee')
          }
          return
        } else {
          // If no "Done" response for clock out, show error and don't navigate
          setError('Waiting for server confirmation... Please try again if this persists.')
          setSending(false)
          return
        }
      }

      // For other actions (clockIn, startBreak, endBreak), proceed normally
      if (captured) localStorage.setItem('selfieDataUrl', captured)
      localStorage.setItem('lastGeo', JSON.stringify(current))
      if (nameToSend) localStorage.setItem('lastAddress', nameToSend)
      
      // Store clockIn_id for clock-in action
      if (clockInId) {
        localStorage.setItem('currentClockInId', clockInId)
        console.log('Stored clockIn_id in localStorage:', clockInId)
      }

      // If backend confirms with 'Done', go home/close immediately
      if (res.ok && /done/i.test(text)) {
        if (window.opener) {
          window.close()
        } else {
          window.location.replace('/employee')
        }
        return
      }
    } catch (e) {
      // For clock out, show error and don't navigate
      if (action === 'clockOut') {
        setError('Network error. Please check your connection and try again.')
        setSending(false)
        return
      }
      // For other actions, fall through to default behavior
    }
    // Default behavior if no explicit 'Done' received (for non-clockOut actions)
    if (captured) localStorage.setItem('selfieDataUrl', captured)
    localStorage.setItem('lastGeo', JSON.stringify(current))
    if (nameToSend) localStorage.setItem('lastAddress', nameToSend)
    
    // Store clockIn_id for clock-in action
    if (clockInId) {
      localStorage.setItem('currentClockInId', clockInId)
      console.log('Stored clockIn_id in localStorage (fallback):', clockInId)
    }
    if (window.opener) {
      window.close()
    } else {
      window.location.replace('/employee')
    }
    setSending(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Loading overlay for geolocation */}
      {locLoading && (
        <LoadingSpinner 
          message="" 
          fullScreen 
          size="lg" 
        />
      )}
      
      {/* Loading overlay for webhook submission */}
      {sending && (
        <LoadingSpinner 
          message="" 
          fullScreen 
          size="lg" 
        />
      )}

      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>{actionLabel} - Selfie & Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md overflow-hidden border bg-black/5">
            {captured ? (
              <img src={captured} alt="Captured" className="w-full h-64 object-cover bg-black/10" />
            ) : (
              <video ref={videoRef} playsInline muted className="w-full h-64 object-cover bg-black/10" />
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="text-sm flex items-center justify-between">
            <p>Location: {placeName ? placeName : coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Waiting for location...'}</p>
            {!coords && (
              <Button size="sm" variant="outline" onClick={requestLocationAndName} disabled={locLoading}>
                {locLoading ? 'Getting…' : 'Get Location'}
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end">
            {!captured ? (
              <Button variant="outline" onClick={takePhoto}>Take Photo</Button>
            ) : (
              <>
                <Button variant="outline" onClick={retake}>Retake</Button>
                <Button onClick={saveAndClose} disabled={!coords || locLoading || sending}>
                  {sending ? 'Saving…' : locLoading ? 'Getting location…' : actionLabel}
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Tip: On mobile, ensure camera and location permissions are allowed.</p>
        </CardContent>
      </Card>
    </div>
  )
}
