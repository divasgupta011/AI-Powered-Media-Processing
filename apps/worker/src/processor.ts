import { UnrecoverableError, type Job } from 'bullmq'
import type { Label, MediaJobData, SafetyResult } from '@camarin/shared'
import { prisma } from '@camarin/db'
import { createAiClient } from './ai'
import { env } from './env'
import { isRetryable } from './errors'
import { runPipeline } from './pipeline'
import { getObject } from './storage'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Stage = 'caption' | 'labels' | 'safety'

async function saveStep(
  jobId: string,
  data: { caption?: string; labels?: Label[]; safety?: SafetyResult },
  stage: Stage,
) {
  await prisma.jobResult.upsert({ where: { jobId }, create: { jobId, ...data }, update: data })
  await prisma.job.update({ where: { id: jobId }, data: { pipelineStage: stage } })
}

export function createProcessor() {
  const ai = createAiClient()

  return async function process(job: Job<MediaJobData>) {
    const { jobId } = job.data
    const record = await prisma.job.findUnique({ where: { id: jobId }, include: { result: true } })
    if (!record) return // job row is gone, nothing to process

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing', attempts: { increment: 1 } },
    })

    try {
      if (env.PROCESSING_DELAY_MS > 0) await sleep(env.PROCESSING_DELAY_MS)
      const image = await getObject(record.storageKey)
      const existing = {
        caption: record.result?.caption ?? null,
        labels: (record.result?.labels as Label[] | null) ?? null,
        safety: (record.result?.safety as SafetyResult | null) ?? null,
      }

      const result = await runPipeline(image, existing, ai, {
        onCaption: (caption) => saveStep(jobId, { caption }, 'caption'),
        onLabels: (labels) => saveStep(jobId, { labels }, 'labels'),
        onSafety: (safety) => saveStep(jobId, { safety }, 'safety'),
      })

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          pipelineStage: 'done',
          flagged: result.flagged,
          flaggedCategory: result.flaggedCategory,
        },
      })

      if (result.flagged) {
        await prisma.notification.create({
          data: {
            userId: record.userId,
            jobId,
            type: 'flagged',
            message: `"${record.originalFilename}" was flagged for ${result.flaggedCategory}.`,
          },
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const attempts = job.opts.attempts ?? 1
      // mark failed if this is the last attempt (or it can't be retried); otherwise
      // record the error and rethrow so BullMQ retries with backoff. a retry re-enters
      // here and resets status back to processing, so an early "failed" self-corrects.
      const lastAttempt = job.attemptsMade >= attempts - 1

      if (!isRetryable(err)) {
        await markFailed(jobId, message)
        throw new UnrecoverableError(message)
      }
      if (lastAttempt) {
        await markFailed(jobId, message)
      } else {
        await prisma.job.update({ where: { id: jobId }, data: { lastError: message } })
      }
      throw err
    }
  }
}

async function markFailed(jobId: string, message: string) {
  await prisma.job.update({ where: { id: jobId }, data: { status: 'failed', lastError: message } })
}
