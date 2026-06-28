import { ImageAnnotatorClient } from '@google-cloud/vision'
import type { Label, Likelihood, SafetyResult } from '@camarin/shared'
import { SAFE_SEARCH_CATEGORIES } from '@camarin/shared'
import { PermanentError } from '../errors'

// created lazily so mock mode never needs google credentials
let client: ImageAnnotatorClient | null = null
function getClient() {
  if (!client) client = new ImageAnnotatorClient()
  return client
}

// gRPC INVALID_ARGUMENT (3) / PERMISSION_DENIED (7) won't get better on retry
function rethrow(err: unknown): never {
  const code = (err as { code?: number }).code
  if (code === 3 || code === 7) throw new PermanentError(`vision rejected the request (code ${code})`)
  throw err
}

export async function labelsWithVision(image: Buffer): Promise<Label[]> {
  try {
    const [result] = await getClient().labelDetection({ image: { content: image } })
    return (result.labelAnnotations ?? []).map(
      (l: { description?: string | null; score?: number | null }) => ({
        description: l.description ?? '',
        score: l.score ?? 0,
      }),
    )
  } catch (err) {
    rethrow(err)
  }
}

export async function safetyWithVision(image: Buffer): Promise<SafetyResult> {
  try {
    const [result] = await getClient().safeSearchDetection({ image: { content: image } })
    const annotation = (result.safeSearchAnnotation ?? {}) as Record<string, unknown>
    const safety = {} as SafetyResult
    for (const category of SAFE_SEARCH_CATEGORIES) {
      safety[category] = (annotation[category] as Likelihood) ?? 'UNKNOWN'
    }
    return safety
  } catch (err) {
    rethrow(err)
  }
}
