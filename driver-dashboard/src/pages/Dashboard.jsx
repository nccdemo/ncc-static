import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMyBookings, getMyInstances, getMyTours } from '../api/client.js'

export default function Dashboard() {
  const [counts, setCounts] = useState({ tours: 0, instances: 0, bookings: 0 })
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [tours, instances, bookings] = await Promise.all([
          getMyTours(),
          getMyInstances(),
          getMyBookings(),
        ])
        if (!cancelled) {
          setCounts({
            tours: tours.length,
            instances: instances.length,
            bookings: bookings.length,
          })
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Errore caricamento')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p>Panoramica dei tuoi tour, date e prenotazioni.</p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      <div className="grid-stats">
        <div className="stat">
          <div className="stat-value">{counts.tours}</div>
          <div className="stat-label">Tour attivi</div>
        </div>
        <div className="stat">
          <div className="stat-value">{counts.instances}</div>
          <div className="stat-label">Date programmate</div>
        </div>
        <div className="stat">
          <div className="stat-value">{counts.bookings}</div>
          <div className="stat-label">Prenotazioni (totali)</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Azioni rapide</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          Crea un tour, aggiungi una data con posti disponibili, controlla le prenotazioni.
        </p>
        <div className="btn-row">
          <Link to="/tours/create" className="btn btn-primary">
            Nuovo tour
          </Link>
          <Link to="/instances" className="btn btn-ghost">
            Nuova data tour
          </Link>
          <Link to="/bookings" className="btn btn-ghost">
            Vedi prenotazioni
          </Link>
        </div>
      </div>
    </>
  )
}
