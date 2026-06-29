import { env } from '../env'
import { captionWithHuggingFace } from './huggingface'
import { labelsWithVision, safetyWithVision } from './google'
import { mockAiClient } from './mock'
import type { AiClient } from './types'
import { captionWithVlm } from './vlm'

function visionConfigured(): boolean {
  return env.GOOGLE_VISION_API_KEY.length > 0
}

export function createAiClient(): AiClient {
  if (env.AI_MOCK) return mockAiClient

  // caption: local model in-process, or a hosted vision LLM via HF providers
  const caption = env.CAPTION_PROVIDER === 'vlm' ? captionWithVlm : captionWithHuggingFace

  // vision needs an api key - fall back to mock for labels/safety if absent
  const vision = visionConfigured()
  console.log(`ai: caption=${env.CAPTION_PROVIDER}, vision=${vision ? 'google' : 'mock'}`)
  if (!vision) {
    console.warn('GOOGLE_VISION_API_KEY not set - using mock for labels + safety')
  }

  return {
    caption,
    labels: vision ? labelsWithVision : mockAiClient.labels,
    safety: vision ? safetyWithVision : mockAiClient.safety,
  }
}
