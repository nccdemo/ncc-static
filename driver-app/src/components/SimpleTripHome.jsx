import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchDriverTrip, updateDriverTripStatus } from '../api/driverTrips.js'
import { formatApiDetail } from '../lib/api.js'

function buildMapsDirectionsUrl(lat, lng, label) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`
  }
  const q = (label || '').trim()
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/**
 * Minimal “today” home: one large trip card, start/complete, open in maps.
 */
export default function SimpleTripHome({
  driverId,
  trips,
  loading,
  listError,
  onOpenService,
  onTripsChanged,
}) {
  const [pickId, setPickId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr, setDetailErr] = useState('')
  const [busy, setBusy] = useState(false)

  const firstId = trips[0]?.id ?? null

  useEffect(() => {
    if (!trips.length) {
      setPickId(null)
      setDetail(null)
      return
    }
    const stillHere = pickId != null && trips.some((t) => Number(t.id) === Number(pickId))
    if (!stillHere) {
      setPickId(firstId)
    }
  }, [trips, pickId, firstId])

  useEffect(() => {
    if (pickId == null || driverId == null) {
      setDetail(null)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      setDetailLoading(true)
      setDetailErr('')
      try {
        const d = await fetchDriverTrip(pickId, driverId)
        if (!cancelled) setDetail(d)
      } catch (e) {
        if (!cancelled) {
          setDetail(null)
          setDetailErr(
            formatApiDetail(e?.response?.data?.detail) ||
              (typeof e?.message === 'string' ? e.message : '') ||
              'Impossibile caricare il viaggio.',
          )
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pickId, driverId])

  const pickupUrl = useMemo(() => {
    if (!detail) return null
    return buildMapsDirectionsUrl(detail.pickup_lat, detail.pickup_lng, detail.pickup)
  }, [detail])

  const dropoffUrl = useMemo(() => {
    if (!detail) return null
    return buildMapsDirectionsUrl(detail.destination_lat, detail.destination_lng, detail.destination)
  }, [detail])

  const mobile = detail?.mobile_status
  const canStart = mobile === 'confirmed'
  const canComplete = mobile === 'in_progress'

  const runStatus = useCallback(
    async (status) => {
      if (pickId == null) return
      setBusy(true)
      setDetailErr('')
      try {
        await updateDriverTripStatus(pickId, status)
        await onTripsChanged?.()
      } catch (e) {
        setDetailErr(
          formatApiDetail(e?.response?.data?.detail) ||
            (typeof e?.message === 'string' ? e.message : '') ||
            'Aggiornamento non riuscito.',
        )
      } finally {
        setBusy(false)
      }
    },
    [pickId, onTripsChanged],
  )

  return (
    <div className="mx-auto w-full max-w-lg px-1 pb-6">
      {listError ? (
        <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {listError}
        </p>
      ) : null}

      {loading && (
        <p className="py-10 text-center text-sm text-slate-400">Caricamento viaggi…</p>
      )}

      {!loading && !trips.length && (
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/50 px-6 py-12 text-center">
          <p className="text-lg font-medium text-slate-200">Nessun viaggio attivo</p>
          <p className="mt-2 text-sm text-slate-500">Quando ti assegnano un transfer, apparirà qui.</p>
        </div>
      )}

      {!loading && trips.length > 0 && (
        <>
          {trips.length > 1 ? (
            <label className="mb-3 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Viaggio
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-base text-slate-100 outline-none ring-sky-500/40 focus:ring-2"
                value={pickId ?? ''}
                onChange={(e) => setPickId(Number(e.target.value))}
              >
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.id} · {t.status === 'on_trip' ? 'In corso' : 'Assegnato'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {detailLoading && (
            <p className="py-8 text-center text-sm text-slate-400">Caricamento dettagli…</p>
          )}

          {detailErr && !detailLoading ? (
            <p className="mb-4 rounded-xl border border-amber-500/35 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              {detailErr}
            </p>
          ) : null}

          {detail && !detailLoading ? (
            <article className="overflow-hidden rounded-2xl border border-slate-600/90 bg-slate-900/80 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="border-b border-slate-700/80 bg-slate-800/50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-400/90">
                  Viaggio attivo
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                  {detail.customer_name?.trim() || 'Cliente'}
                </h1>
                {detail.customer_phone ? (
                  <p className="mt-1 text-sm text-slate-400">{detail.customer_phone}</p>
                ) : null}
              </div>

              <div className="space-y-5 px-5 py-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Partenza</p>
                  <p className="mt-1 text-base leading-snug text-slate-100">
                    {(detail.pickup || '—').trim() || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Destinazione</p>
                  <p className="mt-1 text-base leading-snug text-slate-100">
                    {(detail.destination || '—').trim() || '—'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {pickupUrl ? (
                    <a
                      href={pickupUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex flex-1 min-w-[140px] items-center justify-center rounded-xl border border-slate-500 bg-slate-800/80 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-500/60 hover:bg-slate-800"
                    >
                      Apri in Maps
                    </a>
                  ) : null}
                  {dropoffUrl && pickupUrl !== dropoffUrl ? (
                    <a
                      href={dropoffUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex flex-1 min-w-[140px] items-center justify-center rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
                    >
                      Destinazione
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <button
                    type="button"
                    disabled={!canStart || busy}
                    onClick={() => runStatus('in_progress')}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-900/30 transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Start Trip
                  </button>
                  <button
                    type="button"
                    disabled={!canComplete || busy}
                    onClick={() => {
                      if (!window.confirm('Segnare il viaggio come completato?')) return
                      runStatus('completed')
                    }}
                    className="w-full rounded-xl bg-rose-600 px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-rose-900/30 transition enabled:hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Complete Trip
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-slate-700/80 pt-4">
                  <span className="text-xs text-slate-500">
                    #{detail.trip_id} · {detail.status}
                  </span>
                  <button
                    type="button"
                    className="text-sm font-medium text-sky-400 hover:text-sky-300"
                    onClick={() => onOpenService?.(detail.trip_id)}
                  >
                    Dettaglio & QR
                  </button>
                </div>
              </div>
            </article>
          ) : null}
        </>
      )}
    </div>
  )
}
