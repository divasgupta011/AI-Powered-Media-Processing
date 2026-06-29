import { api } from './api'

export type Notification = {
  id: string
  jobId: string | null
  type: string
  message: string
  read: boolean
  createdAt: string
}

export async function listNotifications(): Promise<Notification[]> {
  const res = await api('/notifications')
  if (!res.ok) throw new Error('failed to load notifications')
  return (await res.json()).notifications
}

export async function markRead(id: string): Promise<void> {
  await api(`/notifications/${id}/read`, { method: 'POST' })
}
