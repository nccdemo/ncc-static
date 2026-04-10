import { useEffect, useState } from 'react'
import { getBnbPartnerEarnings } from '../api/client.js'

function formatMoney(n) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(n) || 0)
}

export default function EarningsPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const e = await getBnbPartnerEarnings()
        if (!cancelled) setData(e)
      } catch (err_) {
        if (!cancelled) setErr(err_?.message || 'Caricamento fallito')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <div className="page-head">
        <h1>Guadagni</h1>
        <p>Pagamenti registrati (carta / contanti) e ripartizione stimata.</p>
      </div>

      {err ? <div className="err">{err}</div> : null}

      {data ? (
        <div className="grid-stats">
          <div className="stat">
            <div className="stat-value">{formatMoney(data.total_bnb_earnings)}</div>
            <div className="stat-label">Quota B&amp;B</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.payment_count}</div>
            <div className="stat-label">Pagamenti</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.total_bookings}</div>
            <div className="stat-label">Prenotazioni confermate</div>
          </div>
          <div className="stat">
            <div className="stat-value">{formatMoney(data.total_gross)}</div>
            <div className="stat-label">Lordo pagamenti</div>
          </div>
          <div className="stat">
            <div className="stat-value">{formatMoney(data.total_platform)}</div>
            <div className="stat-label">Piattaforma</div>
          </div>
          <div className="stat">
            <div className="stat-value">{formatMoney(data.total_driver)}</div>
            <div className="stat-label">Autista</div>
          </div>
        </div>
      ) : !err ? (
        <div className="boot-card" style={{ maxWidth: 320 }}>
          Caricamento…
        </div>
      ) : null}

      {data?.referral_code ? (
        <p className="muted" style={{ marginTop: '1rem' }}>
          Codice referral: <strong>{data.referral_code}</strong>
        </p>
      ) : null}
    </div>
  )
}
