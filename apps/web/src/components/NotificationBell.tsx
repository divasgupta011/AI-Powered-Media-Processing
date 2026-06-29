import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listNotifications, markRead, type Notification } from '../notificationsApi'

export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function refresh() {
    try {
      setItems(await listNotifications())
    } catch {
      // ignore - the bell is non-critical, don't disrupt the page
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const unread = items.filter((n) => !n.read).length

  async function onItem(n: Notification) {
    if (n.read) return
    await markRead(n.id)
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
  }

  return (
    <div className="bell" ref={ref}>
      <button className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label="notifications">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>

      {open && (
        <div className="bell-menu">
          {items.length === 0 ? (
            <p className="muted bell-empty">No notifications</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={n.read ? 'read' : 'unread'} onClick={() => onItem(n)}>
                  {n.jobId ? (
                    <Link to={`/jobs/${n.jobId}`}>{n.message}</Link>
                  ) : (
                    <span>{n.message}</span>
                  )}
                  <span className="muted when">{new Date(n.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
