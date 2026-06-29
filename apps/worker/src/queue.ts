import { type ConnectionOptions } from 'bullmq'
import { env } from './env'

const url = new URL(env.REDIS_URL)

export const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port) || 6379,
  username: url.username || undefined,
  password: url.password || undefined,
  tls: url.protocol === 'rediss:' ? {} : undefined,
  // required by bullmq for managed/serverless redis (e.g. upstash)
  maxRetriesPerRequest: null,
}
