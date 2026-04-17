import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { listMyTours, tourCoverSrc } from '../api/driverTours.js'

export default function DriverToursPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('loading')
  const [tours, setTours] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setPhase('loading')
      setErr('')
      try {
        const { data } = await listMyTours()
        if (!cancelled) {
          setTours(Array.isArray(data) ? data : [])
          setPhase('ok')
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e?.response?.data?.detail || e?.message || 'Failed to load tours')
          setPhase('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    console.log('TOURS:', tours)
  }, [tours])

  const tourList = Array.isArray(tours) ? tours : []

  return (
    <div className="min-h-[60vh] bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">My tours</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Experiences bookable on the marketplace.
            </p>
          </div>
          <Link to="/driver/tours/new">
            <Button type="button" variant="primary" className="!w-auto whitespace-nowrap px-4">
              New tour
            </Button>
          </Link>
        </div>

        {phase === 'loading' ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : null}
        {phase === 'error' ? (
          <Card>
            <p className="text-sm text-red-600">{err}</p>
          </Card>
        ) : null}

        {phase === 'ok' && tourList.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-600">No tours yet</p>
            <Button
              type="button"
              variant="primary"
              className="mt-4"
              onClick={() => navigate('/driver/tours/new')}
            >
              Create your first tour
            </Button>
          </Card>
        ) : null}

        {phase === 'ok' && tourList.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {tourList.map((t) => {
              const src = tourCoverSrc(t.images)
              return (
                <li key={t.id}>
                  <Card className="overflow-hidden !p-0">
                    <div className="flex gap-0 sm:flex-row flex-col">
                      <div className="h-36 w-full shrink-0 bg-neutral-200 sm:h-auto sm:w-32">
                        {src ? (
                          <img
                            src={src}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-center gap-2 p-4">
                        <h2 className="font-semibold text-neutral-900">{t.title}</h2>
                        <p className="text-sm text-blue-600">
                          €{Number(t.price).toFixed(2)}
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          className="!w-auto max-w-[200px]"
                          onClick={() => navigate(`/driver/tours/${t.id}`)}
                        >
                          Manage
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
