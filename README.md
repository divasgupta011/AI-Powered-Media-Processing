# Media processing pipeline

Backend for a content platform where users upload images and we pull structured
metadata out of them automatically. An upload gets stored, queued, and processed
in the background by a separate worker that runs three AI steps over the image:
caption it, detect labels, and run a safety check. The upload call returns a job
id straight away so the user never waits on processing.

- **App:** https://camarin-web-1018445335768.asia-south2.run.app
- **API:** https://ai-powered-media-processing-1018445335768.asia-south2.run.app

## How it works

```
        ┌─────────┐  poll   ┌──────────────┐
 user ─▶│   web   │────────▶│     api      │
        │ (react) │         │  (express)   │
        └─────────┘         └──────┬───────┘
                       store file, │ write pending job,
                       enqueue ────┤ return job id
                  ┌────────────────┼────────────────┐
                  ▼                ▼                 ▼
            ┌──────────┐     ┌──────────┐     ┌──────────┐
            │ postgres │     │  redis   │     │  object  │
            │  (jobs)  │     │ (queue)  │     │ storage  │
            └────▲─────┘     └────┬─────┘     └────▲─────┘
        write    │                │ job            │ read image
        results  │      ┌─────────▼─────────┐      │
                 └──────│      worker       │──────┘
                        │ caption → labels  │──▶ vision + caption apis
                        │   → safety check  │
                        └───────────────────┘
```

The api takes the upload, validates it, drops the file in object storage, writes a
`pending` job row, pushes a job onto the queue, and returns the job id. The worker
is a separate process: it pulls the job, runs the three steps in order, saves each
result as it goes, and marks the job `completed` (or `flagged`). The web app polls
the job endpoints for status.

The two services share nothing but the database, the queue and the bucket, so you
can scale or restart either side on its own.

## Layout

    apps/
      api/      express api: auth, uploads, job + notification endpoints
      worker/   pulls jobs off the queue and runs the AI pipeline
      web/      react frontend (vite)
    packages/
      db/       prisma schema + client, shared by api and worker
      shared/   types and constants used across services

## Running locally

Everything is in compose — db, redis, object storage (minio), api, worker, web:

    cp .env.example .env
    docker compose up --build

Web on http://localhost:8080, api on http://localhost:4000. It defaults to
`AI_MOCK=true`, so the pipeline runs against stubbed AI responses and you can try
the whole thing end to end with no keys. For real results, put the keys below in
`.env` and set `AI_MOCK=false`.

If you'd rather run the services with hot reload instead of building images:

    docker compose up -d db redis minio minio-setup
    npm install
    npm run db:migrate
    npm run dev:api       # :4000
    npm run dev:worker
    npm run dev:web       # :5173

## API collection

A Postman collection covering every endpoint is in `docs/postman_collection.json`.
Import it (Postman → Import → that file), point `base_url` at the deployed api or
`http://localhost:4000`, run **Login** once, and the rest of the requests reuse the
token automatically.

## Environment

Only `DATABASE_URL` and `JWT_SECRET` are strictly required — the rest have defaults
that match compose. For real AI you need the Vision key and the HF token. Full list
is in `.env.example`; the ones that matter:

| var                     | what it's for             | where to get it                                                                                                                                            |
| ----------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | postgres                  | compose locally; [Neon](https://neon.tech) in prod (use the **direct**, non-pooler url)                                                                    |
| `REDIS_URL`             | queue                     | compose locally; [Upstash](https://upstash.com) in prod                                                                                                    |
| `JWT_SECRET`            | signs access tokens       | any long random string (`openssl rand -base64 32`)                                                                                                         |
| `GOOGLE_VISION_API_KEY` | labels + safety           | GCP → enable the Cloud Vision API → APIs & Services → Credentials → **Create API key** (restrict it to the Vision API)                                     |
| `HUGGINGFACE_API_TOKEN` | captioning                | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens), a read token                                                                     |
| `S3_*`                  | object storage            | minio defaults are preset for local; in prod I used GCS via its S3 interoperability API (Cloud Storage → Settings → Interoperability → create an HMAC key) |
| `AI_MOCK`               | stub the AI calls         | leave `true` to run without keys; `false` to hit the real services                                                                                         |
| `WORKER_URL`            | wake a zero-scaled worker | the worker's own url; only needed on Cloud Run, empty everywhere else                                                                                      |
| `CAPTION_PROVIDER`      | `vlm` or `local`          | `vlm` uses a hosted model (needs the HF token), `local` runs in-process                                                                                    |

## The pipeline

Three steps per job, in order:

1. **caption** — a one-line description of the image
2. **labels** — objects/concepts with confidence scores
3. **safety** — SafeSearch across adult / spoof / medical / violence / racy

Each step's output is written the moment it finishes, and the job carries a
`pipelineStage` marker. If a step throws something retryable, BullMQ retries it with
backoff and the worker skips the steps that already completed. Errors that won't get
better — a corrupt image, a request the AI rejects — fail fast instead of burning
retries. A retry from the UI re-enqueues the job and it resumes from the step that
failed.

**Flagged content:** if SafeSearch comes back `LIKELY` or `VERY_LIKELY` on any
category, the job is marked `flagged` with that category, shown distinctly in the
list, and the user gets an in-app notification.

## Decisions

Where the spec left things open:

- **PERN + Prisma.** The user/job/notification data is relational, and Postgres
  JSONB still gives me somewhere flexible to dump the AI output (labels, safety map).
  So I get real SQL filters (`where flagged = true`) without a rigid result schema.
- **BullMQ on redis** for the queue. Retries, backoff and concurrency come for free,
  which is most of what the worker needs. Redis was already in the stack.
- **JWT + refresh tokens.** Short-lived access token (15m) so the api stays stateless
  and scales out with no shared session store; the worker needs no auth context at
  all. Refresh tokens are rotated on use and stored hashed, so I can still revoke a
  session — that's the bit pure JWT usually gives up.
- **Object storage, not local disk.** Local disk is ephemeral on most hosts, so files
  need to live somewhere durable. One `@aws-sdk/client-s3` path covers minio locally
  and GCS in prod — GCS because I was already on GCP for Vision, and its S3
  interoperability API meant no code change, just a different endpoint and keys.
- **Polling, not websockets.** Jobs finish in seconds and the client only needs
  eventual status. Polling is simpler, survives reconnects, and needs no sticky
  sessions. Easy to swap for SSE later if it ever matters.
- **In-app notifications** for flagged uploads (a notifications table + a bell in the
  ui) rather than email — nothing to set up, and it's visible immediately.
- **Captioning model.** The spec suggested HF's BLIP, but that hosted endpoint has
  been retired. Since the model choice is open, captions come from a hosted vision
  LLM (Qwen3-VL via HF inference providers) by default, with a local transformers.js
  model as a no-network fallback. Labels and safety are Google Vision.
- **Vision over a REST API key** rather than the gRPC client + service-account json —
  the GCP org I deployed under blocks service-account key creation, and an API key
  sidesteps that while working the same locally and in the cloud.
- **CI/CD split.** GitHub Actions runs CI (format, typecheck, tests, build) on every
  push. Deploys go through Cloud Build — one config per service that builds the image
  and rolls out a new Cloud Run revision on push to `main`. Cloud Build runs inside
  the project, so it needs no keys; doing the deploy from GitHub Actions would have
  meant setting up workload identity federation for not much gain.

## Deploy

Google Cloud Run, one service each for api, worker and web:

- **api** scales to zero — nothing to pay when idle, cold-starts on the first request
  and runs the db migration on boot.
- **worker** also scales to zero, and gets woken on demand — see below.
- **web** is the built static app served by nginx.

Postgres is Neon, redis is Upstash, images live in a GCS bucket. Each service has a
`cloudbuild.yaml` and a Cloud Build trigger; pushing to `main` rebuilds and
redeploys.

### Waking the worker

Cloud Run sizes a service by its inbound requests, but the worker has none — it
pulls from redis. Left at min-instances=0 it gets scaled away and jobs sit `pending`
forever; pinned at min-instances=1 it bills around the clock to be idle most of it.
So the worker exposes `/wake`, and two things call it:

- the **api**, right after it enqueues. That's what starts an instance, and it's the
  whole of the latency story — a cold start and the job is moving.
- a **Cloud Scheduler** job every 10 minutes, as a backstop for anything the nudge
  misses: a nudge that failed, a job enqueued while the worker was mid-deploy, or a
  BullMQ retry whose backoff expired after the instance went away.

`/wake` doesn't return as soon as it's hit. It holds the request open until the queue
is empty, because Cloud Run only guarantees an instance while a request is in flight
— returning early would let it be scaled away mid-job. Concurrent callers share one
drain loop, and it gives up after 4 minutes so it can't outlive the request timeout.
The api sends the nudge without awaiting it, so uploads still return immediately.

One-time setup, after the worker is deployed. `REGION`, `WORKER` and `API` match the
`_REGION` / `_SERVICE` values in the two `cloudbuild.yaml` files:

```bash
REGION=asia-south2
WORKER=camarin-worker
API=ai-powered-media-processing
PROJECT=$(gcloud config get-value project)

WORKER_URL=$(gcloud run services describe $WORKER --region=$REGION --format='value(status.url)')

# let the api call the private worker
API_SA=$(gcloud run services describe $API --region=$REGION --format='value(spec.template.spec.serviceAccountName)')
gcloud run services add-iam-policy-binding $WORKER --region=$REGION --member="serviceAccount:$API_SA" --role=roles/run.invoker
gcloud run services update $API --region=$REGION --update-env-vars=WORKER_URL=$WORKER_URL

# backstop ping, on its own invoker identity
gcloud iam service-accounts create worker-pinger --display-name='worker wake ping'
PINGER=worker-pinger@$PROJECT.iam.gserviceaccount.com
gcloud run services add-iam-policy-binding $WORKER --region=$REGION --member="serviceAccount:$PINGER" --role=roles/run.invoker

gcloud scheduler jobs create http worker-wake --location=$REGION --schedule='*/10 * * * *' --uri="$WORKER_URL/wake" --http-method=POST --oidc-service-account-email="$PINGER" --oidc-token-audience="$WORKER_URL" --attempt-deadline=300s
```

Locally and in compose `WORKER_URL` is unset, the worker runs continuously, and none
of this is in the path.

## Tests

    npm test

The worker pipeline and retry behaviour are unit-tested: step ordering and resume,
flagged → notification, retryable vs permanent errors, and retry exhaustion landing
the job in `failed`. AI, storage and db are mocked so the tests don't touch the
network.

## Scaling, roughly at 10x

- **api** is stateless, so it's just more instances behind the load balancer. The
  pressure moves to postgres connections (Neon pooling / PgBouncer) and the bucket
  (object stores don't care).
- **worker** is the throughput knob. It's a competing consumer on one queue, so more
  workers — or higher per-worker concurrency — raises throughput close to linearly
  until the **external AI rate limits** become the real ceiling. Past that I'd batch
  calls and back off on 429s.
- The work is IO-bound (each AI call is seconds), so concurrency helps far more than
  CPU, and redis is nowhere near its limits at this scale.
- Order I'd actually hit walls: external AI quota first, then write contention on the
  results table, then db connection limits. None need solving now — that's the
  sequence to watch.

## Known limitations / with more time

- Polling instead of realtime — fine here, but SSE would cut latency and request load.
- No dead-letter queue; a job that exhausts retries just sits in `failed`. I'd add a
  DLQ plus alerting.
- Secrets are plain env vars on the services — Secret Manager would be better.
- No rate limiting on auth/upload yet.
- Images stream through the api (`/jobs/:id/image`); signed URLs + a CDN would take
  that off the api.
- The jobs list isn't paginated, and there's no email verification / password reset.

## Status

- [x] monorepo + infra (postgres, redis, minio) in compose
- [x] data model (prisma schema)
- [x] auth (signup / login, jwt + refresh)
- [x] upload + storage + enqueue (type + size validation)
- [x] worker pipeline (caption, labels, safety) + retries
- [x] flagged content handling + notifications
- [x] frontend (list, detail, upload, retry, polling, notifications)
- [x] tests, CI, deploy
