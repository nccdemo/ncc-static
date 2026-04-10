import { useEffect, useState } from 'react'
import { getMyBookings } from '../api/client.js'

function fmtTime(t) {
  if (t == null) return '—'
  if (typeof t === 'string') return t.slice(0, 5)
  return String(t)
}

export default function BookingsList() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getMyBookings()
        if (!cancelled) setRows(data)
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
        <h1>Prenotazioni</h1>
        <p>Prenotazioni collegate ai tuoi tour o alle relative date.</p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '1.5rem' }}>Nessuna prenotazione.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Email</th>
                <th>Data</th>
                <th>Ora</th>
                <th>Persone</th>
                <th>Prezzo</th>
                <th>Stato</th>
                <th>Tour inst.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td>{b.customer_name}</td>
                  <td>{b.email}</td>
                  <td>{b.date}</td>
                  <td>{fmtTime(b.time)}</td>
                  <td>{b.people}</td>
                  <td>€ {Number(b.price).toFixed(2)}</td>
                  <td>{b.status}</td>
                  <td>{b.tour_instance_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
