import { tv } from 'tailwind-variants'

export const shareButton = tv({
  base: 'flex h-7 cursor-pointer items-center gap-1.5 rounded border-none px-3 text-[11px] font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent',
  variants: {
    connection: {
      idle: 'bg-accent text-white hover:bg-accent/90',
      joining:
        'animate-pulse motion-reduce:animate-none border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
      connected: 'bg-[var(--color-success-bg)] text-white hover:bg-[var(--color-success-bg-hover)]'
    }
  },
  defaultVariants: { connection: 'idle' }
})
