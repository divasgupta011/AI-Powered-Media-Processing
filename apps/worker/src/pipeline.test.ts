import { describe, expect, it, vi } from 'vitest'
import type { SafetyResult } from '@camarin/shared'
import type { AiClient } from './ai/types'
import { isRetryable, PermanentError } from './errors'
import { computeFlagged, runPipeline } from './pipeline'

const safe: SafetyResult = {
  adult: 'VERY_UNLIKELY',
  spoof: 'UNLIKELY',
  medical: 'UNLIKELY',
  violence: 'VERY_UNLIKELY',
  racy: 'POSSIBLE',
}

function fakeAi(overrides: Partial<AiClient> = {}): AiClient {
  return {
    caption: vi.fn(async () => 'a cat on a sofa'),
    labels: vi.fn(async () => [{ description: 'Cat', score: 0.9 }]),
    safety: vi.fn(async () => safe),
    ...overrides,
  }
}

const noopHooks = () => ({
  onCaption: vi.fn(async () => {}),
  onLabels: vi.fn(async () => {}),
  onSafety: vi.fn(async () => {}),
})

describe('computeFlagged', () => {
  it('does not flag when nothing is LIKELY or VERY_LIKELY', () => {
    expect(computeFlagged(safe)).toEqual({ flagged: false, category: null })
  })

  it('flags on LIKELY', () => {
    expect(computeFlagged({ ...safe, violence: 'LIKELY' })).toEqual({
      flagged: true,
      category: 'violence',
    })
  })

  it('flags on VERY_LIKELY', () => {
    expect(computeFlagged({ ...safe, adult: 'VERY_LIKELY' })).toEqual({
      flagged: true,
      category: 'adult',
    })
  })

  it('does not flag POSSIBLE (the level just below the threshold)', () => {
    expect(computeFlagged({ ...safe, racy: 'POSSIBLE' }).flagged).toBe(false)
  })

  it('returns the first flagged category in SafeSearch order', () => {
    expect(computeFlagged({ ...safe, medical: 'LIKELY', racy: 'VERY_LIKELY' }).category).toBe(
      'medical',
    )
  })
})

describe('runPipeline', () => {
  it('runs all three steps, persists each, and assembles the result', async () => {
    const ai = fakeAi()
    const hooks = noopHooks()
    const result = await runPipeline(Buffer.from('img'), {}, ai, hooks)

    expect(ai.caption).toHaveBeenCalledOnce()
    expect(ai.labels).toHaveBeenCalledOnce()
    expect(ai.safety).toHaveBeenCalledOnce()
    expect(hooks.onCaption).toHaveBeenCalledWith('a cat on a sofa')
    expect(result.caption).toBe('a cat on a sofa')
    expect(result.flagged).toBe(false)
  })

  it('resumes: skips steps whose results already exist', async () => {
    const ai = fakeAi()
    const hooks = noopHooks()
    await runPipeline(
      Buffer.from('img'),
      { caption: 'cached', labels: [{ description: 'X', score: 1 }] },
      ai,
      hooks,
    )

    expect(ai.caption).not.toHaveBeenCalled()
    expect(ai.labels).not.toHaveBeenCalled()
    expect(ai.safety).toHaveBeenCalledOnce() // only the missing step runs
    expect(hooks.onCaption).not.toHaveBeenCalled()
  })

  it('flags the result when safety comes back LIKELY/VERY_LIKELY', async () => {
    const ai = fakeAi({ safety: vi.fn(async () => ({ ...safe, adult: 'VERY_LIKELY' as const })) })
    const result = await runPipeline(Buffer.from('img'), {}, ai, noopHooks())
    expect(result.flagged).toBe(true)
    expect(result.flaggedCategory).toBe('adult')
  })
})

describe('isRetryable', () => {
  it('treats PermanentError as not retryable and everything else as retryable', () => {
    expect(isRetryable(new PermanentError('bad image'))).toBe(false)
    expect(isRetryable(new Error('network blip'))).toBe(true)
    expect(isRetryable('weird string error')).toBe(true)
  })
})
