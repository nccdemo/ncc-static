import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from '../lib/api.js'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.jsx'
import { Input } from '../components/ui/input.jsx'
import { Button } from '../components/ui/button.jsx'

const DEFAULT_FROM_DATE = '2024-01-01'

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

function EarningsChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-muted-foreground">Nessun dato disponibile</div>
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis
            dataKey="date"
            tickFormatter={(v) => String(v || '').slice(5)}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            tickFormatter={(v) => `€${v}`}
            tick={{ fontSize: 10 }}
            width={60}
            allowDecimals
          />
          <Tooltip
            formatter={(value) => [`€ ${Number(value || 0).toFixed(2)}`, 'Incassato']}
            labelFormatter={(label) => `Data: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="amount"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AdminEarningsDashboard() {
  const [data, setData] = useState(null)
  const [platform, setPlatform] = useState(null)
  const [referralRows, setReferralRows] = useState([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const [fromDate, setFromDate] = useState(DEFAULT_FROM_DATE)
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])

  function toISO(dateStr) {
    const raw = String(dateStr || '').trim()
    if (!raw) return ''
    try {
      return new Date(raw).toISOString().split('T')[0]
    } catch {
      return ''
    }
  }

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const today = new Date().toISOString().split('T')[0]
      const fromParsed = fromDate.trim() ? toISO(fromDate) : ''
      const toParsed = toDate.trim() ? toISO(toDate) : ''
      const from_date = fromParsed || DEFAULT_FROM_DATE
      const to_date = toParsed || today

      const summaryPromise = api.get('/api/payments/summary', {
        params: {
          from_date,
          to_date,
        },
      })
      const referralPromise = api.get('/api/payments/by-referral').catch((err) => {
        console.error(err)
        return { data: [] }
      })
      const [{ data: json }, refRes] = await Promise.all([summaryPromise, referralPromise])
      console.log('PAYMENTS SUMMARY:', json)
      setData(json)
      setReferralRows(Array.isArray(refRes.data) ? refRes.data : [])

      try {
        const pfRes = await api.get('/api/payments/platform-financials')
        setPlatform(pfRes.data ?? null)
      } catch {
        setPlatform(null)
      }
    } catch (err) {
      console.error(err)
      setError(true)
      setData(null)
      setReferralRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function safeNumber(v, fallback = 0) {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const stats = useMemo(() => {
    const totalPaid = safeNumber(data?.total_paid || 0)
    const refunded = safeNumber(data?.refunded || 0)
    const cashPaid = safeNumber(data?.cash_paid || 0)
    const net = safeNumber(data?.net || 0)

    return {
      totalPaid: `€ ${totalPaid.toFixed(2)}`,
      refunded: `€ ${refunded.toFixed(2)}`,
      cashPaid: `€ ${cashPaid.toFixed(2)}`,
      net: `€ ${net.toFixed(2)}`,
    }
  }, [data])

  const platformStats = useMemo(() => {
    const rev = safeNumber(platform?.total_commission_revenue || 0)
    const payouts = safeNumber(platform?.total_driver_payouts || 0)
    const owed = safeNumber(platform?.total_cash_commission_owed || 0)
    return {
      commission: `€ ${rev.toFixed(2)}`,
      payouts: `€ ${payouts.toFixed(2)}`,
      owed: `€ ${owed.toFixed(2)}`,
    }
  }, [platform])

  const bnbByReferralSorted = useMemo(() => {
    const list = Array.isArray(referralRows) ? [...referralRows] : []
    return list.sort(
      (a, b) =>
        safeNumber(b.total_bnb ?? b.total ?? 0) - safeNumber(a.total_bnb ?? a.total ?? 0),
    )
  }, [referralRows])

  if (error) {
    return <div>Error loading dashboard</div>
  }

  if (!data) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Dashboard guadagni</div>
          <div className="text-sm text-muted-foreground">
            Dati reali da Stripe (tabella Payments). Endpoint: <span className="font-mono">GET /api/payments/summary</span>.
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? 'Aggiornamento…' : 'Ricarica'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Da data</div>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">A data</div>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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
                const t = new Date().toISOString().split('T')[0]
                flushSync(() => {
                  setFromDate(DEFAULT_FROM_DATE)
                  setToDate(t)
                })
                void load()
              }}
              disabled={loading}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="💰 Total paid" value={stats.totalPaid} hint="Somma pagamenti con stato paid" />
        <StatCard label="🔴 Refunded" value={stats.refunded} hint="Somma pagamenti con stato refunded" />
        <StatCard label="🧾 Cash paid" value={stats.cashPaid} hint="Somma pagamenti con stato cash_paid" />
        <StatCard label="🟢 Net" value={stats.net} hint="paid - refunded" />
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-muted-foreground">
          Marketplace / commissioni (GET /api/payments/platform-financials)
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            label="Commissioni piattaforma"
            value={platform ? platformStats.commission : '—'}
            hint="Somma commission_amount su pagamenti paid + cash_paid"
          />
          <StatCard
            label="Payout autisti"
            value={platform ? platformStats.payouts : '—'}
            hint="Somma importi transazioni wallet tipo payout"
          />
          <StatCard
            label="Commissioni cash dovute"
            value={platform ? platformStats.owed : '—'}
            hint="Somma saldi wallet (commissioni cash da incassare)"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guadagni B&amp;B</CardTitle>
          <CardDescription>
            Aggregato per codice referral (endpoint{' '}
            <span className="font-mono">GET /api/payments/by-referral</span>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bnbByReferralSorted.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nessun pagamento con referral.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Referral Code</th>
                    <th className="px-3 py-2 font-medium text-right">Totale Guadagni</th>
                  </tr>
                </thead>
                <tbody>
                  {bnbByReferralSorted.map((row, i) => {
                    const total = safeNumber(row.total_bnb ?? row.total ?? 0)
                    return (
                      <tr
                        key={`${row.referral_code}-${i}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2">{row.bnb_email || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.referral_code || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">€ {total.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Andamento giornaliero (incassato)</CardTitle>
        </CardHeader>
        <CardContent>
          <EarningsChart data={data?.daily_earnings ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}

