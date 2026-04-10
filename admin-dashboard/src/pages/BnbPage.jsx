import { useEffect, useState } from 'react'

import { fetchBnbPerformance } from '../api/client.js'

export default function BnbPage() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchBnbPerformance()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
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
        <h1>Performance B&amp;B</h1>
        <p>Prenotazioni confermate e guadagni stimati per partner (stessa logica del portale B&amp;B).</p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      {loading ? <p className="muted">Caricamento…</p> : null}
      {!loading && !err ? (
        <div className="table-scroll card" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Referral</th>
                <th>User ID</th>
                <th>Prenotazioni (confermate)</th>
                <th>Fatturato prenotazioni</th>
                <th>Pagamenti (n.)</th>
                <th>Quota B&amp;B da pagamenti</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Nessun partner B&amp;B
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.provider_id}>
                    <td>{r.provider_id}</td>
                    <td>{r.referral_code || '—'}</td>
                    <td>{r.user_id ?? '—'}</td>
                    <td>{r.total_bookings}</td>
                    <td>€ {Number(r.total_earnings).toFixed(2)}</td>
                    <td>{r.payment_count}</td>
                    <td>€ {Number(r.total_bnb_earnings_from_payments).toFixed(2)}</td>
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
