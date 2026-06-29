import type { Label, Likelihood, SafetyResult } from '@camarin/shared'
import { SAFE_SEARCH_CATEGORIES } from '@camarin/shared'
import { env } from '../env'
import { PermanentError } from '../errors'

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

type Feature = { type: string; maxResults?: number }

type AnnotateResult = {
  labelAnnotations?: { description?: string; score?: number }[]
  safeSearchAnnotation?: Record<string, string>
  error?: { code?: number; message?: string }
}

async function annotate(image: Buffer, features: Feature[]): Promise<AnnotateResult> {
  const res = await fetch(`${ENDPOINT}?key=${env.GOOGLE_VISION_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: image.toString('base64') }, features }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    // bad request / forbidden won't get better on retry
    if (res.status === 400 || res.status === 403) {
      throw new PermanentError(`vision rejected the request (${res.status})`)
    }
    throw new Error(`vision http ${res.status}: ${body}`)
  }

  const json = (await res.json()) as { responses?: AnnotateResult[] }
  const result = json.responses?.[0] ?? {}
  // per-image failures come back 200 with an error object
  if (result.error) {
    const code = result.error.code
    if (code === 3 || code === 7)
      throw new PermanentError(`vision rejected the request (code ${code})`)
    throw new Error(result.error.message ?? 'vision error')
  }
  return result
}

export async function labelsWithVision(image: Buffer): Promise<Label[]> {
  const result = await annotate(image, [{ type: 'LABEL_DETECTION', maxResults: 10 }])
  return (result.labelAnnotations ?? []).map((l) => ({
    description: l.description ?? '',
    score: l.score ?? 0,
  }))
}

export async function safetyWithVision(image: Buffer): Promise<SafetyResult> {
  const result = await annotate(image, [{ type: 'SAFE_SEARCH_DETECTION' }])
  const annotation = result.safeSearchAnnotation ?? {}
  const safety = {} as SafetyResult
  for (const category of SAFE_SEARCH_CATEGORIES) {
    safety[category] = (annotation[category] as Likelihood) ?? 'UNKNOWN'
  }
  return safety
}
