import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-brand text-white hover:bg-brand-dark active:brightness-95',
  outline: 'border border-[var(--divider)] text-[var(--text)] hover:bg-[rgba(255,255,255,0.06)] active:bg-[rgba(255,255,255,0.08)]',
  ghost: 'hover:bg-[rgba(255,255,255,0.08)] active:bg-[rgba(255,255,255,0.10)]',
  secondary: 'bg-[rgba(255,255,255,0.06)] text-[var(--text)] border border-[var(--divider)] hover:bg-[rgba(255,255,255,0.09)] active:bg-[rgba(255,255,255,0.12)]',
  destructive: 'bg-rose-600 text-white hover:bg-rose-700 active:brightness-95'
}

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-10 px-4 text-[14px]',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-12 px-6 text-[16px]'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-50 disabled:pointer-events-none',
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
