import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-brand text-white hover:brightness-95',
  outline: 'border border-slate-300 hover:bg-slate-50',
  ghost: 'hover:bg-slate-100',
  secondary: 'bg-slate-900 text-white hover:brightness-95',
  destructive: 'bg-red-600 text-white hover:brightness-95'
}

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4',
  lg: 'h-11 px-5 text-base'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50',
          variantClass[variant],
          sizeClass[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
