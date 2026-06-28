import { type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import JobDetail from './pages/JobDetail'
import Jobs from './pages/Jobs'
import Login from './pages/Login'
import Signup from './pages/Signup'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="center">loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
      <Route
        path="/"
        element={
          <Protected>
            <Jobs />
          </Protected>
        }
      />
      <Route
        path="/jobs/:id"
        element={
          <Protected>
            <JobDetail />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
