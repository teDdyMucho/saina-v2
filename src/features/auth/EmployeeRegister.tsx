import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toast, ToastContainer } from '@/components/ui/toast'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import { 
  UserPlus, 
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Loader2,
  CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Custom hook for registration logic
function useRegister() {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Terms removed: registration proceeds when fields are valid

  const validateUsername = (username: string): boolean => {
    return username.trim().length >= 3
  }
  

  const validatePhone = (phone: string): boolean => {
    return /^[\d\s\-\+\(\)]{10,}$/.test(phone)
  }

  const validatePassword = (pwd: string): boolean => {
    return pwd.trim().length >= 8
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required'
    }

    if (!validateUsername(formData.username)) {
      newErrors.username = 'Username must be at least 3 characters'
    }

    

    if (!validatePhone(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number'
    }

    if (!validatePassword(formData.password)) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    // Terms removed

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const register = async (): Promise<{ success: boolean; username: string }> => {
    if (!validateForm()) {
      return { success: false, username: formData.username }
    }

    setLoading(true)

    try {
      // Check username uniqueness in Supabase `user` table
      const { data: existingUser, error: uniqueErr } = await supabase
        .from('user')
        .select('id')
        .eq('user_name', formData.username)
        .maybeSingle()

      if (uniqueErr) {
        // Do not fail fast on read error; just log and continue
        console.warn('Supabase username check error:', uniqueErr)
      }
      if (existingUser) {
        setLoading(false)
        setErrors((prev) => ({ ...prev, username: 'Username already exists' }))
        return { success: false, username: formData.username }
      }

      const res = await fetch('https://primary-production-6722.up.railway.app/webhook/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          username: formData.username,
          phone: formData.phone,
          password: formData.password,
          createdAt: new Date().toISOString()
        })
      })

      // Read response body text and consider it success only if it contains 'done'
      const text = await res.text().catch(() => '')
      const isDone = /\bdone\b/i.test(text)

      setLoading(false)
      return { success: res.ok && isDone, username: formData.username }
    } catch (err) {
      setLoading(false)
      return { success: false, username: formData.username }
    }
  }

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  return {
    formData,
    updateField,
    loading,
    errors,
    register,
    isValid: validateForm,
  }
}

interface EmployeeRegisterProps {
  onRegister?: (username: string) => void
}

export default function EmployeeRegister({ onRegister }: EmployeeRegisterProps) {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const {
    formData,
    updateField,
    loading,
    errors,
    register,
  } = useRegister()

  const [toast, setToast] = useState<{
    show: boolean
    title: string
    description?: string
    variant: 'success' | 'error'
  }>({ show: false, title: '', variant: 'success' })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Highlight fields with errors
    const errorFields: Record<string, boolean> = {}
    Object.keys(errors).forEach((key) => {
      errorFields[key] = true
    })
    setFieldErrors(errorFields)
    
    // Clear highlights after animation
    setTimeout(() => setFieldErrors({}), 500)

    if (Object.keys(errors).length > 0) {
      setToast({
        show: true,
        title: 'Validation Error',
        description: 'Please fix the errors in the form',
        variant: 'error'
      })
      return
    }

    const result = await register()
    
    if (result.success) {
      // Show success toast
      setToast({
        show: true,
        title: 'Registration Successful!',
        description: 'Your account has been created. Redirecting to login...',
        variant: 'success'
      })

      // Call callback
      onRegister?.(result.username)

      // Navigate back to login after short delay
      setTimeout(() => {
        navigate('/login')
      }, 1200)
    } else {
      setToast({
        show: true,
        title: 'Registration Failed',
        description: 'Unable to create account. Please try again.',
        variant: 'error'
      })
    }
  }

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
      <div className="flex items-center justify-center min-h-screen p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-[480px] md:max-w-5xl"
        >
          {/* Glassmorphic card with md+ two-column layout */}
          <div className="relative rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-2xl shadow-primary/20 p-0 overflow-hidden">
            <div className="grid md:grid-cols-2">
              {/* Left: form content */}
              <div className="p-8">
                {/* Brand icon with glow effect */}
                <motion.div 
                  className="flex justify-center md:justify-start mb-6"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary rounded-full blur-md opacity-50 group-hover:opacity-75 transition-opacity" />
                    <div className="relative w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-lg">
                      <UserPlus className="w-8 h-8 text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                </motion.div>

                {/* Title */}
                <div className="text-center md:text-left mb-8">
                  <h1 className="hidden md:block text-3xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Add New Employee
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Create your employee account
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {/* Full Name */}
              <div className="space-y-2">
                <label htmlFor="fullName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <motion.div
                    animate={fieldErrors.fullName ? {
                      x: [0, -10, 10, -10, 10, 0],
                      transition: { duration: 0.4 }
                    } : {}}
                  >
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={formData.fullName}
                      onChange={(e) => updateField('fullName', e.target.value)}
                      className={cn(
                        "pl-10 h-11 bg-white dark:bg-slate-800 border-border focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        errors.fullName && "border-red-500 focus:ring-red-500"
                      )}
                      disabled={loading}
                      aria-invalid={!!errors.fullName}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />
                  </motion.div>
                </div>
                {errors.fullName && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {errors.fullName}
                  </motion.p>
                )}
              </div>

              {/* Email removed as requested */}

              {/* Username */}
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  User Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <motion.div
                    animate={fieldErrors.username ? {
                      x: [0, -10, 10, -10, 10, 0],
                      transition: { duration: 0.4 }
                    } : {}}
                  >
                    <Input
                      id="username"
                      type="text"
                      placeholder="johndoe"
                      value={formData.username}
                      onChange={(e) => updateField('username', e.target.value)}
                      className={cn(
                        "pl-10 h-11 bg-white dark:bg-slate-800 border-border focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        errors.username && "border-red-500 focus:ring-red-500"
                      )}
                      disabled={loading}
                      aria-invalid={!!errors.username}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />
                  </motion.div>
                </div>
                {errors.username && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {errors.username}
                  </motion.p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <motion.div
                    animate={fieldErrors.phone ? {
                      x: [0, -10, 10, -10, 10, 0],
                      transition: { duration: 0.4 }
                    } : {}}
                  >
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={formData.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className={cn(
                        "pl-10 h-11 bg-white dark:bg-slate-800 border-border focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        errors.phone && "border-red-500 focus:ring-red-500"
                      )}
                      disabled={loading}
                      aria-invalid={!!errors.phone}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />
                  </motion.div>
                </div>
                {errors.phone && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {errors.phone}
                  </motion.p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <motion.div
                    animate={fieldErrors.password ? {
                      x: [0, -10, 10, -10, 10, 0],
                      transition: { duration: 0.4 }
                    } : {}}
                  >
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      className={cn(
                        "pl-10 pr-10 h-11 bg-white dark:bg-slate-800 border-border focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        errors.password && "border-red-500 focus:ring-red-500"
                      )}
                      disabled={loading}
                      aria-invalid={!!errors.password}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />
                  </motion.div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {errors.password}
                  </motion.p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <motion.div
                    animate={fieldErrors.confirmPassword ? {
                      x: [0, -10, 10, -10, 10, 0],
                      transition: { duration: 0.4 }
                    } : {}}
                  >
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={(e) => updateField('confirmPassword', e.target.value)}
                      className={cn(
                        "pl-10 pr-10 h-11 bg-white dark:bg-slate-800 border-border focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        errors.confirmPassword && "border-red-500 focus:ring-red-500"
                      )}
                      disabled={loading}
                      aria-invalid={!!errors.confirmPassword}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />
                  </motion.div>
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {errors.confirmPassword}
                  </motion.p>
                )}
              </div>
              {/* Register button */}
              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  type="submit"
                  disabled={
                    loading ||
                    !formData.fullName ||
                    !formData.username ||
                    !formData.phone ||
                    !formData.password ||
                    !formData.confirmPassword
                  }
                  className="w-full h-11 text-sm font-medium bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Create Account
                    </>
                  )}
                </Button>
              </motion.div>
                </form>
              </div>

              {/* Right: showcase panel (desktop only) */}
              <div className="hidden md:block p-10 bg-gradient-to-br from-secondary/20 via-primary/10 to-background">
                <div className="max-w-md ml-auto">
                  <h2 className="text-2xl font-bold text-foreground/90 mb-4">Why managed accounts?</h2>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2"><span className="mt-1 w-2 h-2 rounded-full bg-primary" /> Consistent data for HR and payroll</li>
                    <li className="flex items-start gap-2"><span className="mt-1 w-2 h-2 rounded-full bg-primary" /> Verified identities and access control</li>
                    <li className="flex items-start gap-2"><span className="mt-1 w-2 h-2 rounded-full bg-primary" /> Faster onboarding with templates</li>
                    <li className="flex items-start gap-2"><span className="mt-1 w-2 h-2 rounded-full bg-primary" /> Secure by design, audit-friendly</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
