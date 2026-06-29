import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import AuthedImage from '../components/AuthedImage'
import NotificationBell from '../components/NotificationBell'
import { listJobs, uploadJob, type JobSummary } from '../jobsApi'

const MAX_MB = 5
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

export default function Jobs() {
  const { user, logout } = useAuth()
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      setJobs(await listJobs())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (!ALLOWED.includes(file.type)) {
      setError('only jpg, png or webp')
    } else if (file.size > MAX_MB * 1024 * 1024) {
      setError(`file too large (max ${MAX_MB}MB)`)
    } else {
      setUploading(true)
      try {
        await uploadJob(file)
        await refresh()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setUploading(false)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>Media pipeline</strong>
        <div className="topbar-right">
          <NotificationBell />
          <span className="muted">{user?.email}</span>
          <button className="link" onClick={() => logout()}>
            log out
          </button>
        </div>
      </header>

      <main>
        <div className="uploader">
          <label className="btn">
            {uploading ? 'Uploading…' : 'Upload image'}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFile}
              disabled={uploading}
              hidden
            />
          </label>
          <span className="muted">jpg, png or webp · max 5MB</span>
        </div>
        {error && <p className="error">{error}</p>}

        {jobs.length === 0 ? (
          <p className="muted">No uploads yet.</p>
        ) : (
          <ul className="joblist">
            {jobs.map((job) => (
              <li key={job.id} className={job.flagged ? 'flagged' : ''}>
                <Link to={`/jobs/${job.id}`}>
                  <AuthedImage jobId={job.id} className="thumb" />
                  <span className="fname">{job.originalFilename}</span>
                  <span className={`badge ${job.status}`}>{job.status}</span>
                  {job.flagged && (
                    <span className="badge flag">flagged: {job.flaggedCategory}</span>
                  )}
                  <span className="muted when">{new Date(job.createdAt).toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
