# debian (not alpine) so onnxruntime-node + prisma have prebuilt glibc binaries
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

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
CMD ["npx", "tsx", "apps/worker/src/index.ts"]
