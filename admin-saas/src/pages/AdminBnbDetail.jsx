import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.jsx'

function safeNumber(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function AdminBnbDetail() {
  const { id } = useParams()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/api/payments/by-referral', {
          params: { bnb_id: id },
        })
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) {
          const d = e?.response?.data?.detail
          const msg =
            typeof d === 'string' ? d : Array.isArray(d) ? JSON.stringify(d) : e.message
          setError(msg || 'Errore caricamento')
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const totalEarnings = useMemo(
    () => rows.reduce((sum, r) => sum + safeNumber(r.amount), 0),
    [rows],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" asChild>
              <Link to="/admin/bnb">← Elenco B&amp;B</Link>
            </Button>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Dettaglio B&amp;B</h1>
          <p className="text-sm text-muted-foreground">Provider ID: {id}</p>
        </div>
        <Card className="min-w-[12rem] border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale guadagni B&amp;B
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">€ {totalEarnings.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pagamenti</CardTitle>
          <CardDescription>
            Quote B&amp;B per prenotazione (endpoint{' '}
            <span className="font-mono">GET /api/payments/by-referral?bnb_id=…</span>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Tour</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium text-right">Importo €</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        Nessun pagamento per questo B&amp;B
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr
                        key={`${r.date}-${r.customer_name}-${i}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2">{r.customer_name || '—'}</td>
                        <td className="px-3 py-2">{r.tour || '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.date || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          € {safeNumber(r.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
