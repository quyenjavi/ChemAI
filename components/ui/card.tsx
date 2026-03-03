import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-[var(--divider)] bg-[var(--card)] text-[var(--text)] shadow-[var(--shadow)]', className)} {...props} />
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-[var(--divider)] px-4 py-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-base font-semibold', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-[var(--divider)] px-4 py-3', className)} {...props} />
}
