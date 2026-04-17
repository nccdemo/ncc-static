import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, getDrivers, getVehicles } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.jsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.jsx'
import { Input } from '../components/ui/input.jsx'

function instanceStatusBadge(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'cancelled')
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-200">
        Annullato
      </span>
    )
  if (s === 'completed')
    return (
      <span className="inline-flex items-center rounded-full border border-slate-400/40 bg-slate-500/15 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
        Completato
      </span>
    )
  if (s === 'in_progress')
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
        In corso
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
      Attivo
    </span>
  )
}

function formatVehicleSummary(vehicles, vehicle) {
  if (vehicle?.name) {
    const plate = vehicle.plate ? ` - ${vehicle.plate}` : ''
    return `Vehicle: ${vehicle.name}${plate}`
  }
  if (!Array.isArray(vehicles) || vehicles.length === 0) return 'Nessun veicolo assegnato'
  return vehicles
    .map((v) => `${v.name ?? 'Veicolo'} ×${v.quantity ?? 1} (${v.seats ?? 0} posti)`)
    .join(' · ')
}

function emptyForm() {
  return {
    tourId: '',
    date: '',
    vehicleIds: new Set(),
    vehicleQty: {},
    driverIds: new Set(),
  }
}

export function AdminInstancesPage() {
  const [tours, setTours] = useState([])
  const [instances, setInstances] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState('create')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => emptyForm())
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [manageOpen, setManageOpen] = useState(false)
  const [manageTarget, setManageTarget] = useState(null)
  const [manageBookings, setManageBookings] = useState([])
  const [manageLoading, setManageLoading] = useState(false)
  const [manageError, setManageError] = useState(null)
  const [manageBusy, setManageBusy] = useState(false)

  const loadInstances = useCallback(async () => {
    const iRes = await api.get('/api/tour-instances')
    setInstances(Array.isArray(iRes.data) ? iRes.data : [])
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [tRes, vRes, dRes] = await Promise.all([
          api.get('/api/tours/'),
          getVehicles(),
          getDrivers(),
        ])
        const iRes = await api.get('/api/tour-instances')
        if (cancelled) return
        setTours(Array.isArray(tRes.data) ? tRes.data : [])
        setVehicles(Array.isArray(vRes?.data) ? vRes.data : [])
        setDrivers(Array.isArray(dRes) ? dRes : [])
        setInstances(Array.isArray(iRes.data) ? iRes.data : [])
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.detail ?? e?.message ?? 'Errore caricamento turni')
          setTours([])
          setInstances([])
          setVehicles([])
          setDrivers([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const tourTitleById = useMemo(() => {
    const m = new Map()
    for (const t of tours) {
      if (t?.id != null) m.set(t.id, t.title ?? `Tour #${t.id}`)
    }
    return m
  }, [tours])

  const sortedInstances = useMemo(() => {
    return [...instances].sort((a, b) => {
      const da = String(a?.date ?? '')
      const db = String(b?.date ?? '')
      if (da !== db) return da.localeCompare(db)
      return Number(b?.id ?? 0) - Number(a?.id ?? 0)
    })
  }, [instances])

  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v?.active !== false),
    [vehicles],
  )
  const activeDrivers = useMemo(
    () => drivers.filter((d) => (d?.is_active ?? d?.active) !== false),
    [drivers],
  )

  function openCreate() {
    setDialogMode('create')
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setDialogOpen(true)
  }

  async function openEdit(inst) {
    setDialogMode('edit')
    setEditingId(inst.id)
    setFormError(null)
    setDialogOpen(true)
    setFormLoading(true)
    try {
      const { data } = await api.get(`/api/tour-instances/${inst.id}`)
      const vIds = new Set()
      const vQty = {}
      for (const v of data?.vehicles ?? []) {
        const id = v.vehicle_id
        if (id == null) continue
        vIds.add(id)
        vQty[id] = Math.max(1, Number(v.quantity) || 1)
      }
      const dIds = new Set(
        Array.isArray(data?.driver_ids) ? data.driver_ids.map(Number) : data?.driver_id != null ? [data.driver_id] : [],
      )
      setForm({
        tourId: String(data.tour_id ?? ''),
        date: String(data.date ?? '').slice(0, 10),
        vehicleIds: vIds,
        vehicleQty: vQty,
        driverIds: dIds,
      })
    } catch (e) {
      setFormError(e?.response?.data?.detail ?? e?.message ?? 'Errore caricamento turno')
      setForm(emptyForm())
    } finally {
      setFormLoading(false)
    }
  }

  function toggleVehicle(id) {
    const n = new Set(form.vehicleIds)
    const q = { ...form.vehicleQty }
    if (n.has(id)) {
      n.delete(id)
      delete q[id]
    } else {
      n.add(id)
      q[id] = 1
    }
    setForm((prev) => ({ ...prev, vehicleIds: n, vehicleQty: q }))
  }

  function setVehicleQuantity(id, qty) {
    const n = Math.max(1, Number(qty) || 1)
    setForm((prev) => ({
      ...prev,
      vehicleQty: { ...prev.vehicleQty, [id]: n },
    }))
  }

  function toggleDriver(id) {
    const n = new Set(form.driverIds)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setForm((prev) => ({ ...prev, driverIds: n }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    if (!form.tourId || !form.date) {
      setFormError('Seleziona tour e data.')
      return
    }
    const vehiclesPayload = Array.from(form.vehicleIds).map((id) => ({
      vehicle_id: Number(id),
      quantity: Math.max(1, Number(form.vehicleQty[id]) || 1),
    }))
    const driverIds = Array.from(form.driverIds).map(Number)

    setSubmitting(true)
    try {
      if (dialogMode === 'edit' && editingId != null) {
        await api.patch(`/api/tour-instances/${editingId}`, {
          tour_id: Number(form.tourId),
          date: form.date,
          vehicles: vehiclesPayload,
          driver_ids: driverIds,
        })
      } else {
        await api.post('/api/tour-instances', {
          tour_id: Number(form.tourId),
          date: form.date,
          status: 'active',
          vehicles: vehiclesPayload,
          driver_ids: driverIds,
        })
      }
      await loadInstances()
      setDialogOpen(false)
    } catch (err) {
      const d = err?.response?.data?.detail
      setFormError(typeof d === 'string' ? d : Array.isArray(d) ? JSON.stringify(d) : err?.message ?? 'Errore salvataggio')
    } finally {
      setSubmitting(false)
    }
  }

  async function openManageInstance(inst) {
    setManageTarget(inst)
    setManageBookings([])
    setManageError(null)
    setManageOpen(true)
    setManageLoading(true)
    try {
      const { data } = await api.get(`/api/tour-instances/${inst.id}/bookings`)
      setManageBookings(Array.isArray(data) ? data : [])
    } catch (e) {
      const d = e?.response?.data?.detail
      setManageError(typeof d === 'string' ? d : e?.message ?? 'Impossibile caricare le prenotazioni')
    } finally {
      setManageLoading(false)
    }
  }

  const manageHasBlockingBookings = useMemo(() => {
    return manageBookings.some((b) => {
      const st = String(b?.status || '').toLowerCase()
      return st === 'paid' || st === 'confirmed'
    })
  }, [manageBookings])

  async function handleCancelInstance() {
    if (manageTarget == null) return
    setManageBusy(true)
    setManageError(null)
    try {
      await api.post(`/api/tour-instances/${manageTarget.id}/cancel`)
      await loadInstances()
      setManageOpen(false)
      setManageTarget(null)
    } catch (e) {
      const d = e?.response?.data?.detail
      setManageError(typeof d === 'string' ? d : e?.message ?? 'Annullamento non riuscito')
    } finally {
      setManageBusy(false)
    }
  }

  async function handleDeleteInstance() {
    if (manageTarget == null) return
    setManageBusy(true)
    setManageError(null)
    try {
      await api.delete(`/api/tour-instances/${manageTarget.id}`)
      await loadInstances()
      setManageOpen(false)
      setManageTarget(null)
    } catch (e) {
      const d = e?.response?.data?.detail
      setManageError(typeof d === 'string' ? d : e?.message ?? 'Eliminazione non riuscita')
    } finally {
      setManageBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tour Instances</h1>
        <p className="text-sm text-muted-foreground">
          Turni con posti disponibili e veicoli assegnati. Dati da{' '}
          <span className="font-mono">GET /api/tour-instances</span> e{' '}
          <span className="font-mono">GET /api/tours</span>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={openCreate} className="shrink-0">
          + Crea turno
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {String(error)}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-muted-foreground">Caricamento...</div>
      ) : sortedInstances.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nessun turno disponibile</div>
      ) : (
        <div className="grid gap-4">
          {sortedInstances.map((inst) => {
            const tid = inst?.tour_id
            const title = tourTitleById.get(tid) ?? `Tour #${tid ?? '—'}`
            const total = Number(inst.total_seats ?? inst.capacity) || 0
            const avail = Number(inst.available_seats ?? inst.available) || 0
            const booked = Number(inst.booked) || 0

            return (
              <Card key={inst.id} className="shadow-md shadow-black/10">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">{title}</CardTitle>
                      <CardDescription>
                        Turno #{inst.id} · {inst.date ?? '—'}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                      {instanceStatusBadge(inst.status)}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(inst)}>
                          Modifica
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => openManageInstance(inst)}
                        >
                          Elimina / annulla
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <div className="text-xs text-muted-foreground">Posti totali</div>
                      <div className="text-lg font-semibold">{total}</div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <div className="text-xs text-muted-foreground">Prenotati</div>
                      <div className="text-lg font-semibold">{booked}</div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <div className="text-xs text-muted-foreground">Disponibili</div>
                      <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">
                        {avail}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
                    <div className="text-xs font-medium text-muted-foreground">Veicoli</div>
                    <div className="text-sm">{formatVehicleSummary(inst.vehicles, inst.vehicle)}</div>
                    {inst.driver_name ? (
                      <div className="text-xs text-muted-foreground">
                        Driver: <span className="font-medium text-foreground">{inst.driver_name}</span>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'edit' ? 'Modifica turno' : 'Nuovo turno'}</DialogTitle>
          </DialogHeader>

          {formLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="ti-tour">
                  Tour
                </label>
                <select
                  id="ti-tour"
                  className="flex h-10 w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.tourId}
                  onChange={(e) => setForm((p) => ({ ...p, tourId: e.target.value }))}
                  required
                >
                  <option value="">Seleziona tour</option>
                  {tours.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.title ?? `Tour #${t.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="ti-date">
                  Data
                </label>
                <Input
                  id="ti-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Veicoli</div>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-[10px] border border-border/60 bg-muted/10 p-2">
                  {activeVehicles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessun veicolo attivo</p>
                  ) : (
                    activeVehicles.map((v) => {
                      const checked = form.vehicleIds.has(v.id)
                      return (
                        <div
                          key={v.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-transparent px-1 py-1 hover:border-border/60"
                        >
                          <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleVehicle(v.id)}
                              className="h-4 w-4 rounded border-input"
                            />
                            <span>
                              {v.name} ({v.seats ?? 0} posti)
                              {v.plate ? ` · ${v.plate}` : ''}
                            </span>
                          </label>
                          {checked ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Qty</span>
                              <Input
                                type="number"
                                min={1}
                                className="h-8 w-16 py-1"
                                value={form.vehicleQty[v.id] ?? 1}
                                onChange={(e) => setVehicleQuantity(v.id, e.target.value)}
                              />
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Autisti</div>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-[10px] border border-border/60 bg-muted/10 p-2">
                  {activeDrivers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessun autista attivo</p>
                  ) : (
                    activeDrivers.map((d) => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.driverIds.has(d.id)}
                          onChange={() => toggleDriver(d.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span>{d.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {formError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                >
                  {formError}
                </div>
              ) : null}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Salvataggio…' : 'Salva'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageOpen}
        onOpenChange={(o) => {
          if (!o) {
            setManageOpen(false)
            setManageTarget(null)
            setManageError(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestione turno</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Turno #{manageTarget?.id}
              {manageTarget?.date ? ` · ${manageTarget.date}` : ''}
            </p>
          </DialogHeader>
          {manageLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento prenotazioni…</p>
          ) : (
            <div className="space-y-3 text-sm">
                    {manageBookings.length === 0 ? (
                <p className="text-muted-foreground">Nessuna prenotazione collegata. Puoi eliminare il turno.</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">
                    {manageBookings.length}{' '}
                    {manageBookings.length === 1 ? 'prenotazione' : 'prenotazioni'}
                  </p>
                  <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                    {manageBookings.map((b) => {
                      const st = String(b?.status || '').toLowerCase()
                      const canRefund = st === 'paid' || st === 'confirmed'
                      const isManual = !b.payment_intent_id
                      return (
                        <li key={b.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {b.name ?? `#${b.id}`} · {b.passengers} pax · {String(b.status || '—')}{' '}
                            {isManual ? (
                              <span className="ml-1 inline-flex items-center rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                                Pagamento manuale
                              </span>
                            ) : (
                              <span className="ml-1 inline-flex items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                                Stripe
                              </span>
                            )}
                          </span>
                          {canRefund ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={manageBusy || manageLoading}
                              onClick={async () => {
                                setManageBusy(true)
                                setManageError(null)
                                try {
                                  const res = await api.post(`/api/bookings/${b.id}/refund`)
                                  const { data } = await api.get(`/api/tour-instances/${manageTarget.id}/bookings`)
                                  setManageBookings(Array.isArray(data) ? data : [])
                                  await loadInstances()
                                  const msg =
                                    res?.data?.message ||
                                    res?.data?.note ||
                                    (String(b.status || '').toLowerCase() === 'confirmed'
                                      ? 'Rimborso effettuato'
                                      : null)
                                  if (msg) {
                                    setManageError(`Info: ${msg}`)
                                  }
                                } catch (e) {
                                  const d = e?.response?.data?.detail
                                  setManageError(
                                    typeof d === 'string'
                                      ? d
                                      : e?.message ?? 'Rimborso non riuscito',
                                  )
                                } finally {
                                  setManageBusy(false)
                                }
                              }}
                            >
                              Rimborsa
                            </Button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                  {manageHasBlockingBookings ? (
                    <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100">
                      Ci sono prenotazioni pagate o confermate: non puoi eliminare il turno. Usa «Annulla turno»
                      per chiuderlo mantenendo lo storico e, se necessario, usa «Rimborsa» sulle singole
                      prenotazioni confermate.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Puoi eliminare il turno: verranno rimosse solo le prenotazioni ancora in stato pending (o
                      annullate) e i posti torneranno liberi.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {manageError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            >
              {manageError}
            </div>
          ) : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={manageBusy}
              onClick={() => {
                setManageOpen(false)
                setManageTarget(null)
              }}
            >
              Chiudi
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={manageBusy || manageLoading || String(manageTarget?.status || '').toLowerCase() === 'cancelled'}
              onClick={handleCancelInstance}
            >
              {manageBusy ? '…' : 'Annulla turno'}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={manageBusy || manageLoading || manageHasBlockingBookings}
              onClick={handleDeleteInstance}
            >
              {manageBusy ? '…' : 'Elimina solo se pending'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
