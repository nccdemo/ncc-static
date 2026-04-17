import * as React from 'react'
import { cva } from 'class-variance-authority'

import { cn } from '../../lib/utils.js'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        gray: 'border-transparent bg-slate-700/60 text-slate-100',
        yellow: 'border-transparent bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30',
        blue: 'border-transparent bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/30',
        green: 'border-transparent bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }

