import crypto from 'node:crypto'
import type { SafetyResult } from '@camarin/shared'
import { SAFE_SEARCH_CATEGORIES } from '@camarin/shared'
import type { AiClient } from './types'

const SAFE = Object.fromEntries(
  SAFE_SEARCH_CATEGORIES.map((c) => [c, 'VERY_UNLIKELY']),
) as SafetyResult

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const mockAiClient: AiClient = {
  async caption() {
    await wait(250)
    return 'a placeholder caption produced in mock mode'
  },
  async labels() {
    await wait(250)
    return [
      { description: 'Image', score: 0.97 },
      { description: 'Mock data', score: 0.9 },
    ]
  },
  async safety(image) {
    await wait(250)
    // deterministic per image, ~1 in 4 flagged, so the flagged flow is demoable without real keys
    const flagged = crypto.createHash('sha256').update(image).digest()[0] % 4 === 0
    return flagged ? { ...SAFE, adult: 'LIKELY' } : SAFE
  },
}
