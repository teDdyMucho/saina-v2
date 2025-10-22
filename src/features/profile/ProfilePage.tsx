import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const username = user?.email || '' // using email field as username in this app
  const [phone, setPhone] = useState(user?.phone || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [showSavedModal, setShowSavedModal] = useState(false)

  const onPickImage = () => fileRef.current?.click()
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      setAvatar(url)
    }
    reader.readAsDataURL(f)
  }

  const onSave = async () => {
    setError(null)
    if (password || confirm) {
      if (password !== confirm) {
        setError('Passwords do not match.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
    }
    setSaving(true)
    try {
      // Send to webhook
      const payload: any = {
        name,
        username,
        phone,
        avatar,
      }
      if (password) payload.password = password

      const res = await fetch('https://primary-production-6722.up.railway.app/webhook/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await res.text().catch(() => '')
      if (!res.ok || !/done/i.test(text)) {
        setError('Waiting for server confirmation... Please try again if this persists.')
        return
      }

      // Update local store after confirmed success
      updateUser({ name, phone, avatar })
      setShowSavedModal(true)
      // Auto-close after 2 seconds
      setTimeout(() => setShowSavedModal(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-muted border">
              {avatar ? (
                <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No photo</div>
              )}
            </div>
            <div className="space-x-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
              <Button variant="outline" className="rounded-xl" onClick={onPickImage}>Upload Photo</Button>
              {avatar && (
                <Button variant="ghost" className="rounded-xl" onClick={() => setAvatar(undefined)}>Remove</Button>
              )}
            </div>
          </div>

          {/* Username (read-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <Input value={username} disabled readOnly />
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Full Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxxx" />
          </div>

          {/* Password (optional) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password (optional)</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="pt-2">
            <Button onClick={onSave} disabled={saving} className="rounded-xl">
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showSavedModal && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSavedModal(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl border bg-background shadow-xl p-6 text-center">
              <h3 className="text-lg font-semibold mb-2">Profile saved successfully.</h3>
              <div className="mt-4">
                <Button className="rounded-xl" onClick={() => setShowSavedModal(false)}>OK</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
