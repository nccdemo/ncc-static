import { useEffect, useMemo, useState } from 'react'

import {
  assignDriverToInstance,
  fetchDrivers,
  fetchTourInstances,
  fetchTours,
} from '../api/client.js'

export default function DriversPage() {
  const [drivers, setDrivers] = useState([])
  const [instances, setInstances] = useState([])
  const [tourTitles, setTourTitles] = useState({})
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [instanceId, setInstanceId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [assignMsg, setAssignMsg] = useState('')
  const [assignErr, setAssignErr] = useState('')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [dList, iList, tours] = await Promise.all([
          fetchDrivers(),
          fetchTourInstances(),
          fetchTours(),
        ])
        if (cancelled) return
        setDrivers(Array.isArray(dList) ? dList : [])
        setInstances(Array.isArray(iList) ? iList : [])
        const map = {}
        if (Array.isArray(tours)) {
          for (const t of tours) {
            map[t.id] = t.title || `Tour #${t.id}`
          }
        }
        setTourTitles(map)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Errore')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const instanceOptions = useMemo(() => {
    return [...instances].sort((a, b) => {
      const da = String(a.date || '')
      const db = String(b.date || '')
      if (da !== db) return db.localeCompare(da)
      return (b.id ?? 0) - (a.id ?? 0)
    })
  }, [instances])

  async function onAssign(e) {
    e.preventDefault()
    setAssignMsg('')
    setAssignErr('')
    const iid = parseInt(String(instanceId), 10)
    const did = parseInt(String(driverId), 10)
    if (!Number.isFinite(iid) || !Number.isFinite(did)) {
      setAssignErr('Seleziona turno e autista.')
      return
    }
    setAssigning(true)
    try {
      await assignDriverToInstance(iid, did)
      setAssignMsg(`Autista assegnato al turno #${iid}.`)
      const iList = await fetchTourInstances()
      setInstances(Array.isArray(iList) ? iList : [])
    } catch (e) {
      setAssignErr(e instanceof Error ? e.message : 'Assegnazione fallita')
    } finally {
      setAssigning(false)
    }
  }

  function labelInstance(inst) {
    const title = tourTitles[inst.tour_id] || `Tour ${inst.tour_id}`
    const st = (inst.status || '').toLowerCase()
    return `#${inst.id} — ${title} — ${inst.date}${st ? ` (${st})` : ''}`
  }

  return (
    <div>
      <header className="page-head">
        <h1>Autisti e assegnazione tour</h1>
        <p>Elenco autisti e assegnazione al turno (tour instance).</p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      {loading ? <p className="muted">Caricamento…</p> : null}

      {!loading && !err ? (
        <>
          <div className="card">
            <h2>Assegna autista a un turno</h2>
            {assignMsg ? <div className="ok-banner">{assignMsg}</div> : null}
            {assignErr ? <div className="err">{assignErr}</div> : null}
            <form className="form-grid" onSubmit={onAssign} style={{ maxWidth: 560 }}>
              <div className="field">
                <label htmlFor="instance">Turno (tour instance)</label>
                <select
                  id="instance"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  required
                >
                  <option value="">— Seleziona —</option>
                  {instanceOptions.map((inst) => (
                    <option key={inst.id} value={String(inst.id)}>
                      {labelInstance(inst)}
                      {inst.driver_name ? ` — attuale: ${inst.driver_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="driver">Autista</label>
                <select
                  id="driver"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  required
                >
                  <option value="">— Seleziona —</option>
                  {drivers
                    .filter((d) => d.is_active !== false)
                    .map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        #{d.id} — {d.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="btn-row">
                <button type="submit" className="btn btn-primary" disabled={assigning}>
                  {assigning ? 'Salvataggio…' : 'Assegna'}
                </button>
              </div>
            </form>
          </div>

          <div className="table-scroll card" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Telefono</th>
                  <th>Attivo</th>
                  <th>Stato</th>
                  <th>Signup</th>
                </tr>
              </thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Nessun autista
                    </td>
                  </tr>
                ) : (
                  drivers.map((d) => (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>{d.name}</td>
                      <td>{d.email ?? '—'}</td>
                      <td>{d.phone}</td>
                      <td>{d.is_active ? 'sì' : 'no'}</td>
                      <td>{d.status}</td>
                      <td>{d.signup_status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
