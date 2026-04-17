import { useNavigate } from 'react-router-dom'

import { Button } from '../components/ui/button.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export function Header() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const role = String(user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const roleLabel = isAdmin ? 'ADMIN MODE' : user?.company_name ? `Company: ${user.company_name}` : 'Company'

  return (
    <header className="shrink-0 border-b border-border bg-background/60 backdrop-blur">
      <div className="flex h-14 w-full min-w-0 items-center justify-between gap-3 px-5">
        <div className="flex items-center gap-3">
          <div className="lg:hidden">
            <div className="h-9 w-9 rounded-md border border-border bg-card" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">NCC Dashboard</div>
              {user ? (
                <span
                  className={[
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                    isAdmin
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
                  ].join(' ')}
                >
                  {roleLabel}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              Operazioni in tempo reale{user?.email ? ` · ${user.email}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={handleLogout}>
            Esci
          </Button>
          <Button variant="outline" size="sm" type="button">
            Supporto
          </Button>
          <Button size="sm" type="button" className="shadow-sm">
            Nuova corsa
          </Button>
        </div>
      </div>
    </header>
  )
}

