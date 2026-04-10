import { useEffect, useState } from 'react'

import { fetchAdminBnbList } from '../api/client.js'

export default function AdminBnbList() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchAdminBnbList()
        console.log('Admin BNB list response:', data)
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error('Admin BNB list error:', e)
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
        <h1>Partner B&amp;B</h1>
        <p>Elenco account: email, codice referral e guadagni registrati.</p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      {loading ? <p className="muted">Caricamento…</p> : null}
      {!loading && !err ? (
        <div className="table-scroll card" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Email</th>
                <th>Referral Code</th>
                <th>Earnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    Nessun partner B&amp;B
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.email}-${r.referral_code}-${i}`}>
                    <td>{r.email || '—'}</td>
                    <td>{r.referral_code || '—'}</td>
                    <td>€ {Number(r.earnings).toFixed(2)}</td>
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
