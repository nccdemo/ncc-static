export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-200 ring-slate-700',
    green: 'bg-emerald-900/40 text-emerald-200 ring-emerald-800',
    yellow: 'bg-amber-900/40 text-amber-200 ring-amber-800',
    red: 'bg-rose-900/40 text-rose-200 ring-rose-800',
    blue: 'bg-sky-900/40 text-sky-200 ring-sky-800',
    violet: 'bg-violet-900/40 text-violet-200 ring-violet-800',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  )
}

