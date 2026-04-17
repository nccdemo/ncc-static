import { Button } from './Button.jsx'

export function PricingCard({ name, price, desc, items, highlight = false }) {
  return (
    <div
      className={[
        'rounded-2xl p-6',
        highlight
          ? 'border border-white/20 bg-gradient-to-b from-white/10 to-white/5'
          : 'border border-white/10 bg-slate-950/40',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{name}</div>
        {highlight ? (
          <div className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15">
            Consigliato
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="text-4xl font-semibold tracking-tight text-white">{price}€</div>
        <div className="pb-1 text-sm text-slate-300">/mese</div>
      </div>

      <p className="mt-2 text-sm text-slate-300">{desc}</p>

      <div className="mt-5">
        <Button as="a" href="#cta" variant={highlight ? 'primary' : 'secondary'} className="w-full">
          Richiedi demo
        </Button>
      </div>

      <ul className="mt-5 space-y-2 text-sm text-slate-200">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-300/70" />
            <span className="text-slate-200">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

