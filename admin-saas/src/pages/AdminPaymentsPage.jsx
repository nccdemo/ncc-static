import { useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'
import { Input } from '../components/ui/input.jsx'

function statusBadge(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'paid') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
        pagato
      </span>
    )
  }
  if (s === 'refunded') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-500">
        rimborsato
      </span>
    )
  }
  if (s === 'cash_paid') {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-500">
        cash
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-500">
      pending
    </span>
  )
}

export function AdminPaymentsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState(null)

  const [filterStatus, setFilterStatus] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterCustomer) params.customer = filterCustomer
      if (filterFrom) params.from_date = filterFrom
      if (filterTo) params.to_date = filterTo
      const { data } = await api.get('/api/payments', { params })
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : e?.message ?? 'Errore caricamento pagamenti')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = load

  const handleRefund = async (paymentId) => {
    setActionLoadingId(paymentId)
    try {
      await api.post(`/api/payments/${paymentId}/refund`)
      fetchPayments()
    } finally {
      setActionLoadingId(null)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  }, [rows])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Pagamenti</div>
          <div className="text-sm text-muted-foreground">
            Tutti i pagamenti clienti (Stripe). Endpoint: <span className="font-mono">GET /api/payments</span>.
          </div>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Aggiornamento…' : 'Ricarica'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Stato</div>
              <select
                className="flex h-10 w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Tutti</option>
                <option value="paid">paid</option>
                <option value="refunded">refunded</option>
                <option value="cash_paid">cash_paid</option>
                <option value="pending">pending</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Cliente (nome o email)</div>
              <Input
                value={filterCustomer}
                onChange={(e) => setFilterCustomer(e.target.value)}
                placeholder="es. mario, @gmail.com"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Da data</div>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">A data</div>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={load} disabled={loading}>
              Applica
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setFilterStatus('')
                setFilterCustomer('')
                setFilterFrom('')
                setFilterTo('')
                load()
              }}
              disabled={loading}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Elenco pagamenti (clienti)</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="text-sm text-muted-foreground">Caricamento…</div>
          ) : sortedRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nessun pagamento trovato</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">ID</th>
                    <th className="px-2 py-2">Booking</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Importo</th>
                    <th className="px-2 py-2">Stato</th>
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0">
                      <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{p.id}</td>
                      <td className="px-2 py-1.5 text-sm">
                        #{p.booking_id}
                      </td>
                      <td className="px-2 py-1.5 text-sm">
                        <div className="truncate">{p.customer_name || '—'}</div>
                      </td>
                      <td className="px-2 py-1.5 text-sm">
                        <div className="truncate text-xs text-muted-foreground">{p.email || '—'}</div>
                      </td>
                      <td className="px-2 py-1.5 text-sm font-semibold">€ {Number(p.amount || 0).toFixed(2)}</td>
                      <td className="px-2 py-1.5">{statusBadge(p.status)}</td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loading || actionLoadingId === p.id || String(p.status || '').toLowerCase() === 'refunded'}
                          onClick={() => handleRefund(p.id)}
                        >
                          Refund
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

