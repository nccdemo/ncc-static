import { useNavigate } from 'react-router-dom'

import { Button } from '../components/ui/button.jsx'

export function Header() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  }

  return (
    <header className="shrink-0 border-b border-border bg-background/60 backdrop-blur">
      <div className="flex h-14 w-full min-w-0 items-center justify-between gap-3 px-5">
        <div className="flex items-center gap-3">
          <div className="lg:hidden">
            <div className="h-9 w-9 rounded-md border border-border bg-card" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">NCC Dashboard</div>
            <div className="text-xs text-muted-foreground">Operazioni in tempo reale</div>
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

