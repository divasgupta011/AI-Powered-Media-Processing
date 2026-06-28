# Media processing pipeline

Backend for a content platform where users upload images and we pull structured
metadata out of them automatically. An upload gets stored, queued, and processed
in the background by a separate worker that runs three AI steps over the image:
caption it, detect labels, and run a safety check. The upload call returns a job
id straight away so the user never waits on processing.

Still building this out — see the status list at the bottom for what's wired up.

## Layout

    apps/
      api/      express api: auth, uploads, job + notification endpoints
      worker/   pulls jobs off the queue and runs the AI pipeline
      web/      react frontend (vite)
    packages/
      db/       prisma schema + client, shared by api and worker
      shared/   types and constants used across services

## Running locally

Needs Docker and Node 20+.

    cp .env.example .env
    docker compose up -d db redis minio minio-setup   # infra
    npm install
    npm run db:migrate                                # create the schema
    npm run dev:api
    npm run dev:worker
    npm run dev:web

`AI_MOCK=true` is the default, so the pipeline runs against stubbed AI responses and
you don't need any keys to try it. Put real Google Vision / Hugging Face keys in
`.env` and set `AI_MOCK=false` to hit the real services. Once the services are
containerised the whole stack will come up with a plain `docker compose up`.

## Why these choices

- **PERN + Prisma.** The job/user/notification data is relational, and Postgres
  JSONB still gives me somewhere flexible to dump the AI output (labels, safety
  map). So I get SQL filters (`where flagged = true`) without a rigid result schema.
- **BullMQ on Redis** for the queue. Retries, backoff and concurrency come for free,
  which is most of what the worker needs.
- **JWT auth.** Stateless, so the api scales out with no shared session store and the
  worker needs no auth context at all.
- **S3-compatible storage.** MinIO locally, R2/S3 in prod, one code path. Local disk
  is ephemeral on most hosts so files need to live somewhere durable.
- **Polling** for job status updates — simple and robust; no sticky sessions.

A fuller writeup (architecture diagram, full env reference, tradeoffs, scaling notes)
goes here as the pieces land.

## Status

- [x] monorepo + infra (postgres, redis, minio) in compose
- [x] data model (prisma schema)
- [ ] auth (signup / login)
- [ ] upload + storage + enqueue
- [ ] worker pipeline (caption, labels, safety) + retries
- [ ] flagged content handling + notifications
- [ ] frontend
- [ ] tests, CI, deploy
