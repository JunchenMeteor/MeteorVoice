/**
 * Button component (shadcn/ui).
 * 按钮组件。
 */

import type { ButtonHTMLAttributes } from 'react'
import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

const variants = {
  primary: 'bg-[var(--theme-accent)] text-white hover:opacity-90',
  secondary: 'border border-[var(--theme-border)] bg-[var(--theme-bg-card)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-surface)]',
  ghost: 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-primary)]',
  danger: 'bg-[var(--theme-danger)] text-white hover:opacity-90',
}

const sizes = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export { Button }
