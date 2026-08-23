import { createServer, type Server } from 'node:http'
import { mediaQueue } from './queue'

// The worker pulls from redis, it doesn't serve traffic - so on cloud run at
// min-instances=0 there is nothing to keep an instance alive, and queued jobs sit
// there forever. /wake fixes both halves of that: hitting it starts an instance
// (which is enough on its own, since bullmq begins consuming the moment the process
// boots), and the request then stays open until the queue is empty. Cloud run won't
// scale down an instance with a request in flight, so the job can't be killed
// half-processed. Callers are the api after it enqueues, and a scheduled ping as a
// backstop.

const POLL_MS = 1000
// cap the hold below cloud run's 300s request timeout. if there's still work left
// the caller just gets a 200 and the next ping picks up where this left off.
const MAX_HOLD_MS = 240_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function outstanding() {
  const counts = await mediaQueue.getJobCounts('wait', 'active', 'delayed', 'prioritized', 'paused')
  return Object.values(counts).reduce((total, n) => total + n, 0)
}

async function loop() {
  const deadline = Date.now() + MAX_HOLD_MS
  let clean = 0

  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    try {
      // two clean reads in a row - a single one can land in the gap between a job
      // leaving the wait list and showing up as active
      clean = (await outstanding()) === 0 ? clean + 1 : 0
      if (clean >= 2) return 'drained'
    } catch (err) {
      console.log(`wake: cannot reach redis - ${err instanceof Error ? err.message : err}`)
      return 'unavailable'
    }
  }
  return 'busy'
}

let inFlight: Promise<string> | null = null

// every concurrent caller shares one drain loop, so a burst of uploads doesn't mean
// a burst of pollers against redis
function drain() {
  if (inFlight) return inFlight
  const run = loop().finally(() => {
    if (inFlight === run) inFlight = null
  })
  inFlight = run
  return run
}

export function startHttpServer(port: number): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]

    if (path === '/wake') {
      void drain().then((outcome) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(outcome)
      })
      return
    }

    const ok = path === '/health' || path === '/'
    res.writeHead(ok ? 200 : 404, { 'content-type': 'text/plain' })
    res.end(ok ? 'worker ok' : 'not found')
  })

  // never time a /wake hold out from under us; the loop's own deadline governs
  server.requestTimeout = 0
  server.headersTimeout = 60_000

  server.listen(port, () => console.log(`worker http on :${port} (/health, /wake)`))
  return server
}
