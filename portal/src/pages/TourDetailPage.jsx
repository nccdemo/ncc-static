import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { getMyTour, listTourInstances, tourCoverSrc } from '../api/driverTours.js'

function formatInstanceDate(iso) {
  if (!iso) return '—'
  const d = String(iso).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

function instanceBadge(row) {
  const st = String(row.status || '').toLowerCase()
  if (st === 'cancelled') return { label: 'Cancelled', className: 'bg-neutral-200 text-neutral-700' }
  const av = Number(row.available ?? row.available_seats ?? 0)
  if (av <= 0) return { label: 'Sold out', className: 'bg-amber-100 text-amber-900' }
  return { label: 'Active', className: 'bg-emerald-100 text-emerald-900' }
}

export default function TourDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const tourId = Number(id)
  const [phase, setPhase] = useState('loading')
  const [tour, setTour] = useState(null)
  const [instances, setInstances] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!Number.isFinite(tourId)) {
      setPhase('error')
      setErr('Invalid tour')
      return
    }
    let cancelled = false
    ;(async () => {
      setPhase('loading')
      setErr('')
      try {
        const [tRes, iRes] = await Promise.all([
          getMyTour(tourId),
          listTourInstances(tourId),
        ])
        if (cancelled) return
        setTour(tRes.data)
        setInstances(Array.isArray(iRes.data) ? iRes.data : [])
        setPhase('ok')
      } catch (e) {
        if (cancelled) return
        setErr(e?.response?.data?.detail || e?.message || 'Failed to load')
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tourId])

  const cover = tour ? tourCoverSrc(tour.images) : ''

  return (
    <div className="min-h-[60vh] bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => navigate('/driver/tours')}
          className="mb-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          Back to tours
        </button>

        {phase === 'loading' ? <p className="text-sm text-neutral-500">Loading…</p> : null}
        {phase === 'error' ? (
          <Card>
            <p className="text-sm text-red-600">{err}</p>
          </Card>
        ) : null}

        {phase === 'ok' && tour ? (
          <>
            <div className="overflow-hidden rounded-xl bg-neutral-200 shadow-md">
              {cover ? (
                <img src={cover} alt="" className="h-48 w-full object-cover" />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
                  No image
                </div>
              )}
            </div>
            <h1 className="mt-4 text-xl font-bold text-neutral-900">{tour.title}</h1>
            {tour.city ? (
              <p className="text-sm text-neutral-600">{tour.city}</p>
            ) : null}
            <p className="mt-2 text-lg font-semibold text-blue-600">
              €{Number(tour.price).toFixed(2)}
            </p>
            {tour.description ? (
              <p className="mt-3 text-sm leading-relaxed text-neutral-700">{tour.description}</p>
            ) : null}

            <div className="mt-6">
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate(`/driver/tours/${tourId}/instances`)}
              >
                + Add date
              </Button>
            </div>

            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Scheduled dates
            </h2>
            {instances.length === 0 ? (
              <Card>
                <p className="text-sm text-neutral-600">No instances yet. Add a date to go live.</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {instances.map((row) => {
                  const b = instanceBadge(row)
                  return (
                    <li key={row.id}>
                      <Card className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-neutral-900">
                            {formatInstanceDate(row.date)}
                          </p>
                          <p className="text-xs text-neutral-500">
                            Spots: {Number(row.available ?? 0)} / {Number(row.capacity ?? 0)} free
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${b.className}`}
                        >
                          {b.label}
                        </span>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
