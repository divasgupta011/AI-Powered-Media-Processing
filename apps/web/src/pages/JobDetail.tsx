import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AuthedImage from '../components/AuthedImage'
import { getJob, retryJob, type JobDetail as Job } from '../jobsApi'

const RISKY = ['LIKELY', 'VERY_LIKELY']
function riskClass(v: string) {
  if (RISKY.includes(v)) return 'risk-high'
  if (v === 'POSSIBLE') return 'risk-mid'
  return 'risk-low'
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      setJob(await getJob(id!))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    refresh()
  }, [id])

  // keep polling until the job reaches a terminal state
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [job?.status])

  if (error) {
    return (
      <div className="app">
        <p className="error">{error}</p>
        <Link to="/">← back</Link>
      </div>
    )
  }
  if (!job) return <div className="center">loading…</div>

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/">← jobs</Link>
      </header>

      <main className="detail">
        <h2>{job.originalFilename}</h2>
        <p>
          <span className={`badge ${job.status}`}>{job.status}</span>
          {job.flagged && <span className="badge flag">flagged: {job.flaggedCategory}</span>}
        </p>

        <AuthedImage jobId={job.id} className="detail-img" />

        {(job.status === 'pending' || job.status === 'processing') && (
          <p className="muted">Processing — this updates on its own.</p>
        )}

        {job.status === 'failed' && (
          <div className="failbox">
            <p className="error">{job.lastError ?? 'processing failed'}</p>
            <button
              onClick={async () => {
                await retryJob(job.id)
                refresh()
              }}
            >
              Retry
            </button>
          </div>
        )}

        {job.result && (
          <div className="results">
            <section>
              <h3>Caption</h3>
              <p>{job.result.caption ?? '—'}</p>
            </section>
            <section>
              <h3>Labels</h3>
              {job.result.labels?.length ? (
                <ul className="chips">
                  {job.result.labels.map((l) => (
                    <li key={l.description}>
                      {l.description}
                      <span className="score">{Math.round(l.score * 100)}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">—</p>
              )}
            </section>
            <section>
              <h3>Safety</h3>
              {job.result.safety ? (
                <ul className="safety">
                  {Object.entries(job.result.safety).map(([k, v]) => (
                    <li key={k}>
                      <span>{k}</span> <span className={riskClass(v)}>{v}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">—</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
