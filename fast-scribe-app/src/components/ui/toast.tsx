import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

const ToastProvider = ToastPrimitive.Provider
const ToastViewport = ({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Viewport>) => (
  <ToastPrimitive.Viewport
    className={cn(
      'fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80',
      className
    )}
    {...props}
  />
)

const Toast = ({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Root>) => (
  <ToastPrimitive.Root
    className={cn(
      'group pointer-events-auto relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl transition-all',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-4',
      className
    )}
    {...props}
  />
)

const ToastTitle = ({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Title>) => (
  <ToastPrimitive.Title className={cn('text-sm font-semibold text-zinc-100', className)} {...props} />
)

const ToastDescription = ({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Description>) => (
  <ToastPrimitive.Description className={cn('text-xs text-zinc-400', className)} {...props} />
)

const ToastClose = ({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Close>) => (
  <ToastPrimitive.Close
    className={cn('absolute right-2 top-2 rounded p-0.5 text-zinc-500 hover:text-zinc-200', className)}
    {...props}
  >
    <X size={14} />
  </ToastPrimitive.Close>
)

export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose }
