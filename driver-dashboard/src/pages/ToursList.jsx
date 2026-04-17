import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTours } from '../services/tours.js'

export default function ToursList() {
  const [tours, setTours] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getTours()
        if (!cancelled) setTours(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Errore')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <header className="page-head">
        <h1>I tuoi tour</h1>
        <p>Tour di cui sei titolare (prezzo base lato autista).</p>
      </header>
      <div className="btn-row" style={{ marginBottom: '1rem' }}>
        <Link to="/tours/create" className="btn btn-primary">
          Crea tour
        </Link>
      </div>
      {err ? <div className="err">{err}</div> : null}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {tours.length === 0 ? (
          <p className="muted" style={{ padding: '1.5rem' }}>
            Nessun tour ancora. <Link to="/tours/create">Creane uno</Link>.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Titolo</th>
                <th>Prezzo base</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {tours.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.title}</td>
                  <td>€ {Number(t.price).toFixed(2)}</td>
                  <td>{t.active ? <span className="badge">Attivo</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
