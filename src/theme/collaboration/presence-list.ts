import { tv } from 'tailwind-variants'

/** People in a room, each followed by their agents. */
export const presenceList = tv({
  slots: {
    root: 'flex flex-col gap-0.5',
    person: 'flex h-7 min-w-0 items-center gap-2',
    agent: 'flex h-7 min-w-0 items-center gap-2 pl-8',
    agentIcon: 'size-3.5 shrink-0',
    name: 'min-w-0 flex-1 cursor-default truncate text-left text-[11px] text-surface outline-none focus-visible:ring-1 focus-visible:ring-accent',
    status: 'shrink-0 truncate text-[10px] text-muted',
    renameInput:
      'h-6 min-w-0 flex-1 rounded border border-accent bg-input px-1.5 text-[11px] text-surface outline-none'
  }
})
