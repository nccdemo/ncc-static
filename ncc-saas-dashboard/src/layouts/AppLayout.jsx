import { Outlet } from 'react-router-dom'
import { Header } from './Header.jsx'
import { Sidebar } from './Sidebar.jsx'

export function AppLayout() {
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
