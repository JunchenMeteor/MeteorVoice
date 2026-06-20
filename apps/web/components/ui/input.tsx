/**
 * Input component (shadcn/ui).
 * 输入框组件。
 */

import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('field-input px-3 py-2', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export { Input }
