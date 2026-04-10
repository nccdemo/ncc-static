import { useEffect, useState } from 'react'

import { fetchAdminBookings } from '../api/client.js'

function fmtTime(t) {
  if (t == null) return '—'
  if (typeof t === 'string') return t.slice(0, 5)
  return String(t)
}

export default function BookingsPage() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchAdminBookings()
        if (!cancelled) {
          const list = Array.isArray(data) ? [...data] : []
          list.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
          setRows(list)
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Errore')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <header className="page-head">
        <h1>Tutte le prenotazioni</h1>
        <p>Elenco completo dal backend (solo admin).</p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      {loading ? <p className="muted">Caricamento…</p> : null}
      {!loading && !err ? (
        <div className="table-scroll card" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Email</th>
                <th>Data</th>
                <th>Ora</th>
                <th>Persone</th>
                <th>Stato</th>
                <th>Prezzo</th>
                <th>Tour inst.</th>
                <th>Referral</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="muted">
                    Nessuna prenotazione
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{b.customer_name}</td>
                    <td>{b.email}</td>
                    <td>{b.date ?? '—'}</td>
                    <td>{fmtTime(b.time)}</td>
                    <td>{b.people}</td>
                    <td>{b.status}</td>
                    <td>€ {Number(b.price ?? 0).toFixed(2)}</td>
                    <td>{b.tour_instance_id ?? '—'}</td>
                    <td>{b.referral_code ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
