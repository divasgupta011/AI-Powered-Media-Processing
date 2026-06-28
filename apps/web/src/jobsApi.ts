import { api } from './api'

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type JobSummary = {
  id: string
  status: JobStatus
  originalFilename: string
  flagged: boolean
  flaggedCategory: string | null
  createdAt: string
}

export type Label = { description: string; score: number }

export type JobDetail = JobSummary & {
  mimeType: string
  sizeBytes: number
  pipelineStage: string | null
  lastError: string | null
  attempts: number
  updatedAt: string
  result: {
    caption: string | null
    labels: Label[] | null
    safety: Record<string, string> | null
  } | null
}

async function fail(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}))
  throw new Error(data.error ?? fallback)
}

export async function listJobs(): Promise<JobSummary[]> {
  const res = await api('/jobs')
  if (!res.ok) await fail(res, 'failed to load jobs')
  return (await res.json()).jobs
}

export async function getJob(id: string): Promise<JobDetail> {
  const res = await api(`/jobs/${id}`)
  if (!res.ok) await fail(res, 'job not found')
  return (await res.json()).job
}

export async function uploadJob(file: File): Promise<{ jobId: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await api('/jobs', { method: 'POST', body: form })
  if (!res.ok) await fail(res, 'upload failed')
  return res.json()
}

export async function retryJob(id: string): Promise<void> {
  const res = await api(`/jobs/${id}/retry`, { method: 'POST' })
  if (!res.ok) await fail(res, 'retry failed')
}
