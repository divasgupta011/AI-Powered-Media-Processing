import 'dotenv/config'
import { Worker } from 'bullmq'
import { MEDIA_QUEUE } from '@camarin/shared'
import { env } from './env'
import { createProcessor } from './processor'
import { connection } from './queue'

const worker = new Worker(MEDIA_QUEUE, createProcessor(), {
  connection,
  concurrency: env.WORKER_CONCURRENCY,
})

worker.on('completed', (job) => {
  console.log(`done: ${job.data.jobId}`)
})

worker.on('failed', (job, err) => {
  console.log(`failed: ${job?.data.jobId} - ${err.message}`)
})

console.log(
  `worker up on "${MEDIA_QUEUE}" (mock=${env.AI_MOCK}, concurrency=${env.WORKER_CONCURRENCY})`,
)
