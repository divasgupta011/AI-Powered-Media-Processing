import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('invalid env:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
