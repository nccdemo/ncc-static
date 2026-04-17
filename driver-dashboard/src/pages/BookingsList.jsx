import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getMyBookings } from '../api/client.js'
import { cancelBooking } from '../services/bookings'

function fmtTime(t) {
  if (t == null) return '—'
  if (typeof t === 'string') return t.slice(0, 5)
  return String(t)
}

export default function BookingsList() {
  const location = useLocation()
  const isTrips = location.pathname === '/trips'
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  async function loadBookings() {
    setErr('')
    const data = await getMyBookings()
    setRows(Array.isArray(data) ? data : [])
  }

  async function handleCancel(id) {
    if (!window.confirm('Confirm cancel and refund?')) return
    try {
      await cancelBooking(id)
      alert('Booking cancelled and refunded')
      if (typeof loadBookings === 'function') {
        await loadBookings()
      }
    } catch {
      alert('Error cancelling booking')
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getMyBookings()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
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
        <h1>{isTrips ? 'Trips' : 'Prenotazioni'}</h1>
        <p>
          {isTrips
            ? 'Bookings and scheduled services linked to your tours and instances.'
            : 'Prenotazioni collegate ai tuoi tour o alle relative date.'}
        </p>
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
                <th></th>
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
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleCancel(b.id)}
                    >
                      Cancel + Refund
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
