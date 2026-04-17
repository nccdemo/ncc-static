import { Navigate, Outlet } from 'react-router-dom'
import { Layout } from '../components/Layout.jsx'
import { Sidebar } from '../components/Sidebar.jsx'
import { readDispatchAdminSession } from '../lib/api.js'

export function DashboardLayout() {
  if (!readDispatchAdminSession()?.token) {
    return <Navigate to="/sign-in" replace />
  }
  return (
    <Layout sidebar={<Sidebar />}>
      <Outlet />
    </Layout>
  )
}

export default DashboardLayout
