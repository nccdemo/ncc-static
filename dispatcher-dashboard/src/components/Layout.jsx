export function Layout({ sidebar, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-3 min-h-0 md:px-6 md:py-4">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[280px_1fr] md:items-stretch">
          <aside className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 md:min-h-0">
            {sidebar}
          </aside>
          <main className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/20 p-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

