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
  // an idle worker still talks to redis - it long-polls for work and sweeps for
  // stalled jobs. at the defaults that's ~600k commands a month, over upstash's free
  // tier on its own. the long poll wakes the instant a job is pushed, so stretching
  // it costs no latency; only stalled-job detection gets slower.
  drainDelay: 60,
  stalledInterval: 300_000,
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
