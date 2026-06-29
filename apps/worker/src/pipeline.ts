import type { Label, PipelineResult, SafetyResult } from '@camarin/shared'
import { FLAGGING_LIKELIHOODS, SAFE_SEARCH_CATEGORIES } from '@camarin/shared'
import type { AiClient } from './ai/types'

export function computeFlagged(safety: SafetyResult): {
  flagged: boolean
  category: string | null
} {
  for (const category of SAFE_SEARCH_CATEGORIES) {
    if (FLAGGING_LIKELIHOODS.includes(safety[category])) {
      return { flagged: true, category }
    }
  }
  return { flagged: false, category: null }
}

export type ExistingResult = {
  caption?: string | null
  labels?: Label[] | null
  safety?: SafetyResult | null
}

export type PipelineHooks = {
  onCaption: (caption: string) => Promise<void>
  onLabels: (labels: Label[]) => Promise<void>
  onSafety: (safety: SafetyResult) => Promise<void>
}

// caption -> labels -> safety, in order. skips any step whose result already
// exists so a retry resumes instead of re-calling the AI, and persists each
// step as it finishes via the hooks.
export async function runPipeline(
  image: Buffer,
  existing: ExistingResult,
  ai: AiClient,
  hooks: PipelineHooks,
): Promise<PipelineResult> {
  let caption = existing.caption ?? null
  if (caption == null) {
    caption = await ai.caption(image)
    await hooks.onCaption(caption)
  }

  let labels = existing.labels ?? null
  if (labels == null) {
    labels = await ai.labels(image)
    await hooks.onLabels(labels)
  }

  let safety = existing.safety ?? null
  if (safety == null) {
    safety = await ai.safety(image)
    await hooks.onSafety(safety)
  }

  const { flagged, category } = computeFlagged(safety)
  return { caption, labels, safety, flagged, flaggedCategory: category }
}
