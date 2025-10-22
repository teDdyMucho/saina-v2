import * as React from "react"
import { cn } from "@/lib/utils"

interface ToggleGroupProps {
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

export function ToggleGroup({ value, onValueChange, options, className }: ToggleGroupProps) {
  return (
    <div
      className={cn(
        "flex w-full rounded-lg bg-muted p-1",
        className
      )}
      role="radiogroup"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onValueChange(option.value)}
          className={cn(
            "relative inline-flex flex-1 items-center justify-center px-4 py-2 text-sm font-medium transition-all rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            value === option.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
