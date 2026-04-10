import { useCallback, useEffect, useState } from 'react'
import { getMyInstances, getMyTours, createInstance } from '../api/client.js'

export default function InstancesList() {
  const [tours, setTours] = useState([])
  const [instances, setInstances] = useState([])
  const [tourId, setTourId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [seats, setSeats] = useState('7')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')

  const loadData = useCallback(async () => {
    const [t, i] = await Promise.all([getMyTours(), getMyInstances()])
    setTours(t)
    setInstances(i)
    setTourId((tid) => (tid ? tid : t.length > 0 ? String(t[0].id) : ''))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadData()
      } catch (e) {
        if (!cancelled) setLoadErr(e.message || 'Errore caricamento')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadData])

  async function handleCreate(e) {
    e.preventDefault()
    setErr('')
    if (!tourId) {
      setErr('Seleziona un tour')
      return
    }
    const n = parseInt(seats, 10)
    if (Number.isNaN(n) || n < 1) {
      setErr('Posti disponibili non validi')
      return
    }
    setLoading(true)
    try {
      await createInstance({
        tour_id: parseInt(tourId, 10),
        date,
        time: time.trim() || null,
        available_seats: n,
      })
      setTime('')
      await loadData()
    } catch (ex) {
      setErr(ex.message || 'Creazione non riuscita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>Date tour</h1>
        <p>Programma una data, orario opzionale e posti disponibili (non oltre la capienza del veicolo).</p>
      </header>
      {loadErr ? <div className="err">{loadErr}</div> : null}

      <div className="card">
        <h2>Nuova istanza</h2>
        {tours.length === 0 ? (
          <p className="muted">Crea prima un tour dalla sezione Tour.</p>
        ) : (
          <form className="form-grid" style={{ maxWidth: '520px' }} onSubmit={handleCreate}>
            {err ? <div className="err">{err}</div> : null}
            <div className="field">
              <label htmlFor="inst-tour">Tour</label>
              <select
                id="inst-tour"
                value={tourId}
                onChange={(e) => setTourId(e.target.value)}
                required
              >
                {tours.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} (#{t.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="inst-date">Data</label>
              <input
                id="inst-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="inst-time">Orario (opzionale)</label>
              <input
                id="inst-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="inst-seats">Posti disponibili</label>
              <input
                id="inst-seats"
                type="number"
                min={1}
                max={60}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                required
              />
            </div>
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Salvataggio…' : 'Aggiungi data'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 style={{ padding: '1rem 1.5rem 0', margin: 0 }}>Elenco date</h2>
        {instances.length === 0 ? (
          <p className="muted" style={{ padding: '1rem 1.5rem 1.5rem' }}>
            Nessuna data programmata.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tour</th>
                <th>Data</th>
                <th>Ora</th>
                <th>Capienza</th>
                <th>Prenotati</th>
                <th>Disponibili</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>#{row.tour_id}</td>
                  <td>{row.date}</td>
                  <td>{row.start_time || '—'}</td>
                  <td>{row.capacity ?? '—'}</td>
                  <td>{row.booked ?? '—'}</td>
                  <td>{row.available_seats ?? row.available ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
