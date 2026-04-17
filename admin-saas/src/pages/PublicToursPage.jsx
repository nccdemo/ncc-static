import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../lib/api.js'
import { getImageUrl } from '../lib/media.js'

function formatPriceEUR(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${value}€`
}

/** Customer unit price (tour catalog uses base before 1.25 markup). */
function finalUnitPriceEUR(tour) {
  const base = Number(tour?.base_price)
  if (!Number.isFinite(base)) return null
  return Math.round(base * 1.25 * 100) / 100
}

export function PublicToursPage() {
  const navigate = useNavigate()
  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get('/api/tours/public')
        if (cancelled) return
        setTours(Array.isArray(data) ? data : [])
      } catch (e) {
        if (cancelled) return
        setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load tours')
        setTours([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const cards = useMemo(() => tours, [tours])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="text-sm font-semibold tracking-tight">NCC Demo</div>
          <div className="text-xs sm:text-sm text-slate-300">Premium Transfers &amp; Tours</div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14 sm:pb-10">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-7 sm:p-10">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Discover Our Tours
          </h1>
          <p className="mt-3 max-w-2xl text-sm sm:text-base text-slate-300">
            Curated experiences with premium service. Choose your next destination and book in minutes.
          </p>
        </div>
      </section>

      {/* States */}
      {loading ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-center text-sm text-slate-300">
          Loading…
        </div>
      ) : error ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-center text-sm text-slate-300">
          No tours available
        </div>
      ) : (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((t) => {
              const imgs = Array.isArray(t?.images) ? t.images.filter(Boolean) : []
              const hero = imgs[0]
              const imgUrl = getImageUrl(hero) || '/placeholder.jpg'
              return (
              <article
                key={t.id}
                className="group overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl"
              >
                {/* Image (4:3) */}
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-900/60">
                  <img
                    src={imgUrl}
                    alt={t.title ?? `Tour #${t.id}`}
                    className="h-full w-full object-cover transition duration-300 ease-out group-hover:scale-[1.06]"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = '/placeholder.jpg'
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                </div>

                {/* Body */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold leading-tight line-clamp-1">
                      {t.title ?? '—'}
                    </h2>
                    <div className="shrink-0 text-sm font-semibold text-white">
                      {priceLabel != null ? formatPriceEUR(priceLabel) : '—'}
                    </div>
                  </div>

                  {t.city ? (
                    <p className="mt-1 text-xs text-slate-400">📍 {t.city}</p>
                  ) : null}
                  {t.duration != null && t.duration !== '' ? (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Durata: {t.duration} min
                    </p>
                  ) : null}

                  <p className="mt-2 text-sm text-slate-300 line-clamp-2">
                    {t.description ?? '—'}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    Date e disponibilità nella scheda tour.
                  </p>

                  <button
                    type="button"
                    onClick={() => navigate(`/public/tours/${t.id}`)}
                    className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-slate-100"
                  >
                    Book Now
                  </button>
                </div>
              </article>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}