import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  const { status } = useAuth()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  return children
}
