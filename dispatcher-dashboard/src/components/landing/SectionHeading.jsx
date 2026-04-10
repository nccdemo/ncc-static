export function SectionHeading({ kicker, title, sub }) {
  return (
    <div className="max-w-2xl">
      {kicker ? (
        <div className="text-xs font-semibold tracking-wider text-slate-300/80 uppercase">
          {kicker}
        </div>
      ) : null}
      <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
        {title}
      </h2>
      {sub ? <p className="mt-3 text-sm sm:text-base text-slate-300">{sub}</p> : null}
    </div>
  )
}

