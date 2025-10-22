import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ToastProps {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info'
  duration?: number
  onClose?: (id: string) => void
}

const iconMap = {
  default: Info,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const variantStyles = {
  default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  success: 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800',
  error: 'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800',
  warning: 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-200 dark:border-amber-800',
  info: 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border-blue-200 dark:border-blue-800',
}

const iconStyles = {
  default: 'text-gray-600 dark:text-gray-400',
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-blue-600 dark:text-blue-400',
}

const textStyles = {
  default: 'text-gray-900 dark:text-gray-100',
  success: 'text-green-900 dark:text-green-100',
  error: 'text-red-900 dark:text-red-100',
  warning: 'text-amber-900 dark:text-amber-100',
  info: 'text-blue-900 dark:text-blue-100',
}

export function ModernToast({
  id,
  title,
  description,
  variant = 'default',
  duration = 5000,
  onClose,
}: ToastProps) {
  const Icon = iconMap[variant]

  React.useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        onClose?.(id)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [id, duration, onClose])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.3 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.5 }}
      transition={{ type: 'spring', stiffness: 100 }}
      className={cn(
        'pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl border backdrop-blur-xl',
        variantStyles[variant]
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('flex-shrink-0 w-10 h-10 rounded-xl bg-white/50 dark:bg-black/20 flex items-center justify-center', iconStyles[variant])}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 pt-0.5">
            <p className={cn('text-sm font-semibold', textStyles[variant])}>
              {title}
            </p>
            {description && (
              <p className={cn('mt-1 text-sm opacity-90', textStyles[variant])}>
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onClose(id)}
              className={cn(
                'flex-shrink-0 rounded-lg p-1.5 hover:bg-white/20 dark:hover:bg-black/20 transition-colors',
                iconStyles[variant]
              )}
            >
              <X className="w-4 h-4" />
            </motion.button>
          )}
        </div>
        {/* Progress bar */}
        {duration && duration > 0 && (
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: duration / 1000, ease: 'linear' }}
            className={cn('h-1 mt-3 rounded-full origin-left', {
              'bg-gray-300 dark:bg-gray-600': variant === 'default',
              'bg-green-400 dark:bg-green-600': variant === 'success',
              'bg-red-400 dark:bg-red-600': variant === 'error',
              'bg-amber-400 dark:bg-amber-600': variant === 'warning',
              'bg-blue-400 dark:bg-blue-600': variant === 'info',
            })}
          />
        )}
      </div>
    </motion.div>
  )
}

// Toast Container Component
interface ToastContainerProps {
  toasts: ToastProps[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed bottom-0 right-0 z-50 p-4 sm:p-6 pointer-events-none">
      <AnimatePresence mode="sync">
        <div className="flex flex-col gap-3">
          {toasts.map((toast) => (
            <ModernToast key={toast.id} {...toast} onClose={onClose} />
          ))}
        </div>
      </AnimatePresence>
    </div>
  )
}

// Toast Hook
export function useToast() {
  const [toasts, setToasts] = React.useState<ToastProps[]>([])

  const addToast = React.useCallback((toast: Omit<ToastProps, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { ...toast, id }])
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  return {
    toasts,
    addToast,
    removeToast,
  }
}
