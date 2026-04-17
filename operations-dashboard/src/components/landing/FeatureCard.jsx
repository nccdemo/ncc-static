export function FeatureCard({ title, desc }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-300">{desc}</div>
        </div>
      </div>
    </div>
  )
}

