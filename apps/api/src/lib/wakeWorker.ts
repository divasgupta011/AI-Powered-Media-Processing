import { env } from '../env'

// cloud run's metadata server mints an id token for the api's own service account,
// so calling the (private) worker needs no keys - just run.invoker on it
async function idToken(audience: string) {
  const url = new URL(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity',
  )
  url.searchParams.set('audience', audience)

  const res = await fetch(url, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`metadata server returned ${res.status}`)
  return res.text()
}

// The worker sits at min-instances=0, so after an idle spell nothing is listening on
// the queue. Poking /wake starts an instance; that request then stays open until the
// queue drains, which stops cloud run scaling the instance away mid-job. Deliberately
// not awaited - the upload responds straight away and this runs behind it. Best
// effort too: if it fails the job is still safely queued and the scheduled ping will
// pick it up. WORKER_URL is unset locally and in compose, where the worker is always
// running, so this is a no-op there.
export function wakeWorker() {
  if (!env.WORKER_URL) return

  void (async () => {
    try {
      const headers: Record<string, string> = {}
      const token = await idToken(env.WORKER_URL).catch(() => null)
      if (token) headers.authorization = `Bearer ${token}`

      const res = await fetch(`${env.WORKER_URL}/wake`, { method: 'POST', headers })
      if (!res.ok) console.log(`wake worker: ${res.status} ${res.statusText}`)
    } catch (err) {
      console.log(`wake worker failed: ${err instanceof Error ? err.message : err}`)
    }
  })()
}
