import { useEffect, useState } from 'react'

import { fetchAdminBookings, fetchBnbPerformance, fetchDrivers } from '../api/client.js'

export default function DashboardPage() {
  const [counts, setCounts] = useState({ bookings: '—', drivers: '—', bnb: '—' })
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [bookings, drivers, bnb] = await Promise.all([
          fetchAdminBookings(),
          fetchDrivers(),
          fetchBnbPerformance(),
        ])
        if (!cancelled) {
          setCounts({
            bookings: String(bookings?.length ?? 0),
            drivers: String(drivers?.length ?? 0),
            bnb: String(bnb?.length ?? 0),
          })
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Errore caricamento')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p>Riepilogo operativo NCC.</p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      <div className="grid-stats">
        <div className="stat">
          <div className="stat-value">{counts.bookings}</div>
          <div className="stat-label">Prenotazioni totali</div>
        </div>
        <div className="stat">
          <div className="stat-value">{counts.drivers}</div>
          <div className="stat-label">Autisti</div>
        </div>
        <div className="stat">
          <div className="stat-value">{counts.bnb}</div>
          <div className="stat-label">Partner B&amp;B</div>
        </div>
      </div>
    </div>
  )
}
