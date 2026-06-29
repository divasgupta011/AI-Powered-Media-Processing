# build context is the repo root (monorepo workspaces)
FROM node:22-slim AS base
WORKDIR /app
# prisma needs openssl at runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# install deps first for layer caching - copy every workspace manifest
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
# --omit=optional drops onnxruntime/transformers (only used for local captioning)
RUN npm ci --omit=optional

COPY . .
RUN npm -w @camarin/db run generate

ENV NODE_ENV=production
EXPOSE 4000
# apply migrations on boot, then start the api
CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma && exec npx tsx apps/api/src/index.ts"]
