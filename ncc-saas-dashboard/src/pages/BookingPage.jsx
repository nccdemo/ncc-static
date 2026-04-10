import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api } from '../lib/api.js'

export default function BookingPage() {
  const [searchParams] = useSearchParams()
  const raw = searchParams.get('instance_id')
  const instanceId =
    raw != null && String(raw).trim() !== '' ? Number.parseInt(String(raw).trim(), 10) : NaN
  const validId = Number.isFinite(instanceId) && instanceId > 0

  const [loading, setLoading] = useState(validId)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!validId) {
      setLoading(false)
      setData(null)
      setError(null)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        const { data: body } = await api.get(`/api/tour-instances/${instanceId}`)
        if (!cancelled) setData(body)
      } catch (e) {
        if (!cancelled) {
          const d = e?.response?.data?.detail
          setError(
            typeof d === 'string'
              ? d
              : Array.isArray(d)
                ? d.map((x) => (typeof x === 'string' ? x : x?.msg ?? JSON.stringify(x))).join(', ')
                : e?.message ?? 'Errore caricamento',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [instanceId, validId])

  if (!validId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-foreground">
        <p className="text-sm">Instance non valida</p>
        <Link to="/public/tours" className="mt-4 inline-block text-sm text-primary hover:underline">
          Torna ai tour
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-muted-foreground">
        <p className="text-sm">Caricamento…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-foreground">
        <p className="text-sm text-destructive" role="alert">
          {String(error)}
        </p>
        <Link to="/public/tours" className="mt-4 inline-block text-sm text-primary hover:underline">
          Torna ai tour
        </Link>
      </div>
    )
  }

  const available = Number(data?.available_seats ?? data?.available) || 0

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-10 text-foreground">
      <h1 className="text-xl font-semibold tracking-tight">Prenotazione</h1>
      <p className="text-sm text-muted-foreground">
        ID turno: <span className="font-medium text-foreground">{data?.id ?? '—'}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Posti disponibili: <span className="font-medium text-emerald-600">{available}</span>
      </p>
      <Link to="/public/tours" className="inline-block pt-2 text-sm text-primary hover:underline">
        Torna ai tour
      </Link>
    </div>
  )
}
