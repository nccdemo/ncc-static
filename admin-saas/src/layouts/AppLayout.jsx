import { Outlet } from 'react-router-dom'
import { Header } from './Header.jsx'
import { Sidebar } from './Sidebar.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export function AppLayout() {
  const { status } = useAuth()

  if (status === 'error') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
        Session expired. Please login again.
      </div>
    )
  }

  return (
    <div className="app-layout bg-background">
      <aside className="sidebar hidden border-r border-border lg:block">
        <Sidebar />
      </aside>
      <div className="layout-main-column">
        <Header />
        <main className="main-content">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
