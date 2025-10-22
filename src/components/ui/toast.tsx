import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

export interface ToastProps {
  title?: string
  description?: string
  variant?: 'default' | 'success' | 'error'
  onClose?: () => void
}

export function Toast({ title, description, variant = 'default', onClose }: ToastProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1",
        {
          'bg-white ring-gray-200 dark:bg-gray-800 dark:ring-gray-700': variant === 'default',
          'bg-green-50 ring-green-200 dark:bg-green-900/20 dark:ring-green-800': variant === 'success',
          'bg-red-50 ring-red-200 dark:bg-red-900/20 dark:ring-red-800': variant === 'error',
        }
      )}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-1">
            {title && (
              <p className={cn("text-sm font-medium", {
                'text-gray-900 dark:text-gray-100': variant === 'default',
                'text-green-800 dark:text-green-200': variant === 'success',
                'text-red-800 dark:text-red-200': variant === 'error',
              })}>
                {title}
              </p>
            )}
            {description && (
              <p className={cn("mt-1 text-sm", {
                'text-gray-500 dark:text-gray-400': variant === 'default',
                'text-green-700 dark:text-green-300': variant === 'success',
                'text-red-700 dark:text-red-300': variant === 'error',
              })}>
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-4 inline-flex rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ToastContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed top-0 right-0 z-50 p-4 space-y-4">
      {children}
    </div>
  )
}
