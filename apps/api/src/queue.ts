import { Queue, type ConnectionOptions } from 'bullmq'
import { MEDIA_QUEUE } from '@camarin/shared'
import { env } from './env'

const url = new URL(env.REDIS_URL)

export const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port) || 6379,
  username: url.username || undefined,
  password: url.password || undefined,
  tls: url.protocol === 'rediss:' ? {} : undefined,
}

export const mediaQueue = new Queue(MEDIA_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
})
