import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup } from '@/components/ui/toggle-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Toast, ToastContainer } from '@/components/ui/toast'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { 
  Loader2,
  Lock,
  Eye,
  EyeOff,
  User
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

// Custom hook for login logic
function useLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'employee' | 'admin'>('employee')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(false)

  const validateUsername = (u: string): boolean => u.trim().length >= 3
  const validatePassword = (pwd: string): boolean => pwd.trim().length >= 6

  const signIn = async (): Promise<{ success: boolean; role: 'employee' | 'admin'; username: string; fullName?: string }> => {
    setError(null)
    setLoading(true)

    // Validate username
    if (!validateUsername(username)) {
      setLoading(false)
      setError('Please enter a valid username (min 3 characters)')
      return { success: false, role, username }
    }
    // Validate password
    if (!validatePassword(password)) {
      setLoading(false)
      setError('Please enter your password (min 6 characters)')
      return { success: false, role, username }
    }

    try {
      const { data, error: dbError } = await supabase
        .from('user')
        .select('*')
        .eq('user_name', username)
        .eq('password', password)
        .maybeSingle()

      setLoading(false)

      if (dbError) {
        setError('Login failed. Please try again later.')
        return { success: false, role, username }
      }

      if (!data) {
        setError('Invalid username or password')
        return { success: false, role, username }
      }

      // Determine role from DB record (use either `role` or `Role` column; default to employee)
      const dbRoleRaw = (data as any)?.role ?? (data as any)?.Role
      const dbRole: 'employee' | 'admin' = String(dbRoleRaw || '').toLowerCase() === 'admin' ? 'admin' : 'employee'

      return { success: true, role: dbRole, username, fullName: (data as any)?.name as string | undefined }
    } catch (e) {
      setLoading(false)
      setError('Login failed. Please try again later.')
      return { success: false, role, username }
    }
  }

  return {
    username,
    setUsername,
    password,
    setPassword,
    role,
    setRole,
    loading,
    error,
    setError,
    rememberMe,
    setRememberMe,
    signIn,
    isValid: validateUsername(username) && validatePassword(password)
  }
}

interface ModernLoginProps {
  onAuth?: (role: 'employee' | 'admin', username: string) => void
}

export default function ModernLogin({ onAuth }: ModernLoginProps) {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const storedUser = useAuthStore((state) => state.user)
  const {
    username,
    setUsername,
    password,
    setPassword,
    role,
    setRole,
    loading,
    error,
    setError,
    rememberMe,
    setRememberMe,
    signIn,
    isValid
  } = useLogin()

  // Prefill username if previously stored
  useEffect(() => {
    if (storedUser && !username) {
      setUsername(storedUser.email)
    }
  }, [storedUser])

  const [toast, setToast] = useState<{
    show: boolean
    title: string
    description?: string
    variant: 'success' | 'error'
  }>({ show: false, title: '', variant: 'success' })

  const [inlineErrorMsg, setInlineErrorMsg] = useState<string | null>(null)

  const [emailError, setEmailError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isValid) {
      // highlight which field is invalid
      if (username.trim().length < 3) {
        setEmailError(true)
        setTimeout(() => setEmailError(false), 500)
      }
      if (password.trim().length < 6) {
        setPasswordError(true)
        setTimeout(() => setPasswordError(false), 500)
      }
      return
    }

    const result = await signIn()

    if (result.success) {
      // If admin mode selected but DB role is not admin, show generic invalid credentials
      if (role === 'admin' && result.role !== 'admin') {
        setInlineErrorMsg('Invalid username or password')
        setTimeout(() => setInlineErrorMsg(null), 3000)
        return
      }
      // If employee mode selected but DB role is not employee, show generic invalid credentials
      if (role === 'employee' && result.role !== 'employee') {
        setInlineErrorMsg('Invalid username or password')
        setTimeout(() => setInlineErrorMsg(null), 3000)
        return
      }

      // Show success toast
      setToast({
        show: true,
        title: 'Success!',
        description: `Signed in as ${result.role.charAt(0).toUpperCase() + result.role.slice(1)}`,
        variant: 'success'
      })

      // Call auth callback
      onAuth?.(result.role, result.username)
      
      // Update auth store and navigate
      setTimeout(() => {
        login(result.username, result.role, result.fullName || 'John Doe', rememberMe)
        navigate(result.role === 'admin' ? '/admin' : '/employee')
      }, 1000)
    } else {
      setInlineErrorMsg(error || 'Invalid username or password')
      setTimeout(() => setInlineErrorMsg(null), 3000)
    }
  }

  // SSO removed

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ ...toast, show: false })
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-br from-muted/50 via-secondary/20 to-primary/10 dark:from-background dark:via-muted/20 dark:to-background">
      {/* Loading overlay */}
      {loading && (
        <LoadingSpinner 
          message="" 
          fullScreen 
          size="lg" 
        />
      )}

      {/* Animated background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-secondary/30 via-transparent to-transparent dark:from-primary/20" />
      
      {/* Toast notifications */}
      <AnimatePresence>
        {toast.show && (
          <ToastContainer>
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Toast
                title={toast.title}
                description={toast.description}
                variant={toast.variant}
                onClose={() => setToast({ ...toast, show: false })}
              />
            </motion.div>
          </ToastContainer>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
        {/* Left logo panel (hidden on mobile) */}
        <div className="hidden md:flex items-center justify-center p-8">
          <div className="relative w-full max-w-2xl">
            <div className="absolute -top-10 -left-10 h-40 w-40 bg-secondary/20 blur-3xl rounded-full" />
            <div className="absolute -bottom-10 -right-10 h-40 w-40 bg-primary/20 blur-3xl rounded-full" />
            <div className="relative grid gap-6">
              <div className="flex items-center gap-4">
                <img src="/logo1.png" alt="Logo" className="h-16 w-auto object-contain drop-shadow" />
                <div>
                  <div className="text-3xl font-extrabold tracking-tight">STAR</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">Shift Time & Attendance Record</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-xs bg-white/70 dark:bg-slate-900/60 border border-white/40 dark:border-white/10">Realtime</span>
                <span className="px-3 py-1 rounded-full text-xs bg-white/70 dark:bg-slate-900/60 border border-white/40 dark:border-white/10">Geofenced</span>
                <span className="px-3 py-1 rounded-full text-xs bg-white/70 dark:bg-slate-900/60 border border-white/40 dark:border-white/10">Selfie Verified</span>
                <span className="px-3 py-1 rounded-full text-xs bg-white/70 dark:bg-slate-900/60 border border-white/40 dark:border-white/10">Export Ready</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-lg p-5">
                  <div className="text-sm font-semibold mb-1">Track Shifts</div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">Assign schedules by project and manage templates.</p>
                </div>
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-lg p-5">
                  <div className="text-sm font-semibold mb-1">Clock In/Out</div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">Selfie capture and GPS for verified attendance.</p>
                </div>
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-lg p-5">
                  <div className="text-sm font-semibold mb-1">Breaks</div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">Start and end breaks included in totals.</p>
                </div>
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-lg p-5">
                  <div className="text-sm font-semibold mb-1">Reports</div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">Weekly Excel export by project and person.</p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-lg p-5">
                <div className="text-sm font-semibold mb-1">Why STAR?</div>
                <p className="text-xs text-gray-600 dark:text-gray-300">Designed for field teams. Simple clocking, accurate schedules, and clear reporting—everything you need to run shifts smoothly.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-[420px]"
          >
            {/* Glassmorphic card */}
            <div className="relative rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-2xl shadow-primary/20 p-8">
              {/* Brand logo (no background) */}
              <div className="md:hidden flex items-center justify-center mb-6">
                <img src="/logo1.png" alt="Logo" className="h-10 w-auto object-contain" />
              </div>

              {/* Title */}
              <div className="text-center mb-8">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Shift Time & Attendance Record
                </p>
              </div>

              {inlineErrorMsg && (
                <div className="mb-4">
                  <p className="text-center text-sm text-red-600 dark:text-red-400">{inlineErrorMsg}</p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username input */}
              <div className="space-y-2">
                <label 
                  htmlFor="username" 
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  User Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <motion.div
                    animate={emailError ? {
                      x: [0, -10, 10, -10, 10, 0],
                      transition: { duration: 0.4 }
                    } : {}}
                  >
                    <Input
                      id="username"
                      type="text"
                      placeholder="johndoe"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value)
                        setError(null)
                      }}
                      className={cn(
                        "pl-10 h-11 bg-white dark:bg-slate-800 border-border focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        error && "border-red-500 focus:ring-red-500"
                      )}
                      disabled={loading}
                      aria-invalid={!!error}
                      aria-describedby={error ? "username-error" : undefined}
                    />
                  </motion.div>
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    id="username-error"
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {error}
                  </motion.p>
                )}
              </div>

              {/* Password input */}
              <div className="space-y-2">
                <label 
                  htmlFor="password" 
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <motion.div
                    animate={passwordError ? {
                      x: [0, -10, 10, -10, 10, 0],
                      transition: { duration: 0.4 }
                    } : {}}
                  >
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError(null)
                      }}
                      className={cn(
                        "pl-10 pr-10 h-11 bg-white dark:bg-slate-800 border-border focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        error && "border-red-500 focus:ring-red-500"
                      )}
                      disabled={loading}
                      aria-invalid={passwordError}
                    />
                  </motion.div>
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Login As
                </label>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <ToggleGroup
                    value={role}
                    onValueChange={(value) => setRole(value as 'employee' | 'admin')}
                    options={[
                      { value: 'employee', label: 'Employee' },
                      { value: 'admin', label: 'Admin' }
                    ]}
                    className="w-full"
                  />
                </motion.div>
              </div>

              {/* Remember me */}
              <div className="flex items-center justify-start">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  label="Remember me"
                />
              </div>

              {/* Sign in button */}
              <Button
                type="submit"
                disabled={loading || !isValid}
                className="w-full h-11 text-sm font-medium bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              {/* Demo mode helper */}
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Demo mode: Enter any username to continue
              </p>

              {/* Registration link removed: only admins can create accounts */}

              {/* SSO removed */}
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
