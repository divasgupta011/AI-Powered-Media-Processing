import 'dotenv/config'
import { createServer } from 'node:http'
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

// Hosts like Render's free tier only run *web services* (the process must bind a
// port). When PORT is set, expose a tiny health endpoint so the worker can deploy
// there and a cron pinger can keep it awake. Locally / in compose PORT is unset,
// so this is a no-op and the worker stays a pure background process.
const port = Number(process.env.PORT)
if (port) {
  createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('worker ok')
  }).listen(port, () => console.log(`worker health endpoint on :${port}`))
}
