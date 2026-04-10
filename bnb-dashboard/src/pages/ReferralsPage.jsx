import { useEffect, useState } from 'react'
import { getBnbPartnerSummary } from '../api/client.js'
import { referralLinkForCode } from '../auth/storage.js'

export default function ReferralsPage() {
  const [summary, setSummary] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await getBnbPartnerSummary()
        if (!cancelled) setSummary(s)
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'Caricamento fallito')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const code = summary?.referral_code || ''
  const link = referralLinkForCode(code)

  return (
    <div>
      <div className="page-head">
        <h1>Referral</h1>
        <p>Il tuo codice e il link da condividere con gli ospiti.</p>
      </div>

      {err ? <div className="err">{err}</div> : null}

      <div className="card">
        <h2>Codice</h2>
        <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0' }}>{code || '—'}</p>
        <p className="muted" style={{ margin: 0 }}>
          Le prenotazioni con questo codice (o collegate al tuo profilo B&amp;B) compaiono nel
          riepilogo.
        </p>
      </div>

      <div className="card">
        <h2>Link</h2>
        {link ? (
          <>
            <div className="link-box">{link}</div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigator.clipboard.writeText(link)}
              >
                Copia link
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(code)}>
                Copia codice
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Nessun codice disponibile.</p>
        )}
      </div>
    </div>
  )
}
