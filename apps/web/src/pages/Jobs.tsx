import { useAuth } from '../auth'

export default function Jobs() {
  const { user, logout } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <strong>Media pipeline</strong>
        <div>
          <span className="muted">{user?.email}</span>
          <button className="link" onClick={() => logout()}>
            log out
          </button>
        </div>
      </header>
      <main>
        <p className="muted">Upload and your job list show up here — building that next.</p>
      </main>
    </div>
  )
}
