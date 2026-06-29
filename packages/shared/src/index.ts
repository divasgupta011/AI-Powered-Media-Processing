export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 5)
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export type AllowedMime = keyof typeof ALLOWED_MIME_TYPES

export const SAFE_SEARCH_CATEGORIES = ['adult', 'spoof', 'medical', 'violence', 'racy'] as const
export type SafeSearchCategory = (typeof SAFE_SEARCH_CATEGORIES)[number]

export type Likelihood =
  'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY'

// LIKELY or VERY_LIKELY counts as flagged
export const FLAGGING_LIKELIHOODS: Likelihood[] = ['LIKELY', 'VERY_LIKELY']

export type Label = { description: string; score: number }
export type SafetyResult = Record<SafeSearchCategory, Likelihood>

export type PipelineResult = {
  caption: string
  labels: Label[]
  safety: SafetyResult
  flagged: boolean
  flaggedCategory: string | null
}

export const MEDIA_QUEUE = 'media-processing'
export type MediaJobData = { jobId: string }
