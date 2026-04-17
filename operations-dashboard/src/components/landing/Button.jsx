export function Button({ as = 'button', href, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950'
  const styles =
    variant === 'primary'
      ? 'bg-white text-slate-950 hover:bg-slate-100 focus:ring-white'
      : variant === 'secondary'
        ? 'bg-slate-900/70 text-white hover:bg-slate-900 focus:ring-slate-300 ring-1 ring-white/10'
        : 'bg-transparent text-white hover:bg-white/5 focus:ring-white/40 ring-1 ring-white/15'

  const cls = `${base} ${styles} ${className}`.trim()

  if (as === 'a') {
    return <a className={cls} href={href} {...props} />
  }
  return <button className={cls} {...props} />
}

