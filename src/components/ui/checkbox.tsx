import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CheckboxProps {
  id?: string
  checked?: boolean
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  label?: string
  className?: string
  disabled?: boolean
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, checked, onChange, disabled }, ref) => {
    return (
      <div className="flex items-center">
        <div className="relative flex items-center">
          <input
            id={id}
            type="checkbox"
            className="peer sr-only"
            ref={ref}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
          />
          <label
            htmlFor={id}
            className={cn(
              "h-4 w-4 rounded border border-input bg-background ring-offset-background cursor-pointer peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-checked:bg-primary peer-checked:border-primary flex items-center justify-center",
              className
            )}
          >
            <Check className={cn(
              "h-3 w-3 text-primary-foreground transition-opacity",
              checked ? "opacity-100" : "opacity-0"
            )} />
          </label>
        </div>
        {label && (
          <label
            htmlFor={id}
            className="ml-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"
