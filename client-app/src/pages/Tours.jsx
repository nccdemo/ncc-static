import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import axios from '../api/axios'
import { getStoredReferralCode, persistReferralFromUrlSearch } from '../utils/referralStorage'

function formatTourDate(iso) {
  if (iso == null || iso === '') return '—'
  const s = String(iso)
  const dayPart = s.length >= 10 ? s.slice(0, 10) : null
  if (dayPart && /^\d{4}-\d{2}-\d{2}$/.test(dayPart)) {
    const [y, m, d] = dayPart.split('-').map(Number)
    const local = new Date(y, m - 1, d)
    return local.toLocaleDateString('it-IT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
  try {
    const dt = new Date(s)
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('it-IT', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }
  } catch {
    /* ignore */
  }
  return String(iso)
}

export default function Tours() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const canceled = searchParams.get('canceled') === '1'
  const tourIdFilterRaw = searchParams.get('tour_id')
  const tourIdFilter = useMemo(() => {
    const n = parseInt(String(tourIdFilterRaw || ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [tourIdFilterRaw])

  const visibleItems = useMemo(() => {
    if (tourIdFilter == null) return items
    return items.filter((row) => Number(row.tour_id) === tourIdFilter)
  }, [items, tourIdFilter])

  useEffect(() => {
    const raw = searchParams.toString()
    persistReferralFromUrlSearch(raw ? `?${raw}` : '')
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setErr('')
      try {
        const { data } = await axios.get('/tour-instances/public/catalog')
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error(e)
        if (!cancelled) setErr('Impossibile caricare le date. Riprova tra poco.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function goCheckout(row) {
    const referral_code = getStoredReferralCode()
    navigate('/checkout', {
      state: {
        tour: {
          id: row.tour_id,
          title: row.tour_title,
          base_price: row.base_price,
          city: row.city,
        },
        date: row.date,
        tour_instance_id: row.id,
        max_people: row.available_seats,
        ...(referral_code ? { referral_code } : {}),
      },
    })
  }

  return (
    <div className="tours-page">
      <h1 style={{ marginTop: 0 }}>Date disponibili</h1>
      <p className="landing-muted" style={{ marginBottom: '1.25rem' }}>
        Elenco delle prossime partenze con posti liberi. Il prezzo mostrato è per persona (IVA / oneri inclusi
        nel checkout come da listino × 1,25).
      </p>

      {canceled ? (
        <div className="banner-warn" role="status">
          Pagamento annullato. Puoi scegliere un altro turno o riprovare.
        </div>
      ) : null}

      {loading ? <p>Caricamento…</p> : null}
      {err ? (
        <p className="banner-err" role="alert">
          {err}
        </p>
      ) : null}

      {!loading && !err && items.length === 0 ? (
        <p>Nessuna data disponibile al momento.</p>
      ) : null}

      {tourIdFilter != null && !loading && !err ? (
        <p className="landing-muted" style={{ marginBottom: '1rem', textAlign: 'left' }}>
          Date per questo tour. <Link to="/tours">Mostra tutte le partenze</Link>
        </p>
      ) : null}

      {!loading && !err && tourIdFilter != null && items.length > 0 && visibleItems.length === 0 ? (
        <p className="banner-warn" role="status">
          Nessuna partenza con posti liberi per questo tour.{' '}
          <Link to="/tours">Vedi tutte le date</Link>
        </p>
      ) : null}

      <ul className="instance-list">
        {visibleItems.map((row) => (
          <li key={row.id} className="instance-card">
            <div className="instance-card-body">
              <h2 className="instance-title">{row.tour_title}</h2>
              <p className="instance-meta">{formatTourDate(row.date)}</p>
              {row.city ? (
                <p className="instance-meta">
                  📍 {row.city}
                </p>
              ) : null}
              <p className="instance-meta">
                <strong>{row.available_seats}</strong>{' '}
                {row.available_seats === 1 ? 'posto libero' : 'posti liberi'}
              </p>
              <p className="instance-price">
                da €{Number(row.checkout_unit_eur).toFixed(2)}{' '}
                <span className="instance-price-hint">/ persona al checkout</span>
              </p>
            </div>
            <button type="button" className="btn btn-primary instance-cta" onClick={() => goCheckout(row)}>
              Prenota
            </button>
          </li>
        ))}
      </ul>

      <p style={{ marginTop: '2rem' }}>
        <Link to="/explore">← Home</Link>
      </p>
    </div>
  )
}
