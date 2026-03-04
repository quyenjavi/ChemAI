import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-brand text-white hover:bg-brand-dark',
  outline: 'border border-[var(--divider)] text-[var(--text)] hover:bg-[rgba(255,255,255,0.04)]',
  ghost: 'hover:bg-[rgba(255,255,255,0.06)]',
  secondary: 'bg-[var(--card)] text-[var(--text)] border border-[var(--divider)] hover:bg-[rgba(255,255,255,0.06)]',
  destructive: 'bg-red-600 text-white hover:brightness-95'
}

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-4 text-[14px]',
  md: 'h-10 px-5 text-[15px]',
  lg: 'h-11 px-6 text-[16px]'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50',
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
