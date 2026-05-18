import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('field-input px-3 py-2', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export { Input }
