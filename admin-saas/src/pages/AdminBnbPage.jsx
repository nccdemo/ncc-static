import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.jsx'

export function AdminBnbPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/api/admin/bnb')
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.detail || e.message || 'Errore caricamento')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">B&amp;B Affiliati</h1>
        <p className="text-sm text-muted-foreground">
          Elenco partner: email, codice referral e guadagni.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partner</CardTitle>
          <CardDescription>Account B&amp;B collegati alla piattaforma.</CardDescription>
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
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Referral</th>
                    <th className="px-3 py-2 font-medium">Link</th>
                    <th className="px-3 py-2 font-medium text-right">Guadagni</th>
                    <th className="px-3 py-2 font-medium w-[1%] whitespace-nowrap">Dettaglio</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        Nessun partner B&amp;B
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const link = r.referral_code
                        ? `http://localhost:5173/?ref=${r.referral_code}`
                        : ''
                      const b = r
                      const bnbId = b.provider_id ?? b.id
                      const rowNavigable = bnbId != null
                      return (
                        <tr
                          key={`${r.email}-${r.referral_code}-${i}`}
                          onClick={() => {
                            if (bnbId != null) navigate(`/admin/bnb/${bnbId}`)
                          }}
                          className={
                            rowNavigable
                              ? 'cursor-pointer border-b border-border transition-colors hover:bg-muted/60 last:border-0'
                              : 'border-b border-border last:border-0'
                          }
                        >
                          <td className="px-3 py-2">{r.email || '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.referral_code || '—'}</td>
                          <td className="max-w-[min(28rem,55vw)] px-3 py-2">
                            {link ? (
                              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="break-all text-primary underline-offset-4 hover:underline"
                                >
                                  {link}
                                </a>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0"
                                  onClick={() => navigator.clipboard.writeText(link)}
                                >
                                  Copia
                                </Button>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            € {Number(r.earnings).toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            {r.provider_id != null ? (
                              <Link
                                to={`/admin/bnb/${r.provider_id}`}
                                className="font-medium text-primary underline-offset-4 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Apri
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      )
                    })
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
