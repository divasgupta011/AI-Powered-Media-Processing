import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('media-uploads'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  AI_MOCK: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  HUGGINGFACE_API_TOKEN: z.string().default(''),
  HF_CAPTION_MODEL: z.string().default('Xenova/vit-gpt2-image-captioning'),
  // local = run the model in-process; vlm = hosted vision LLM via HF providers
  CAPTION_PROVIDER: z.enum(['local', 'vlm']).default('local'),
  HF_VLM_MODEL: z.string().default('Qwen/Qwen3-VL-8B-Instruct'),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  // artificial per-job delay, for watching the queue back up while testing. 0 = off.
  PROCESSING_DELAY_MS: z.coerce.number().default(0),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('invalid env:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
