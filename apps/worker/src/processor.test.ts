import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnrecoverableError } from 'bullmq'
import { PermanentError } from './errors'

// mock the side-effecting deps so we can test the processor's retry orchestration
const { prismaMock, getObjectMock, aiMock } = vi.hoisted(() => ({
  prismaMock: {
    job: { findUnique: vi.fn(), update: vi.fn() },
    jobResult: { upsert: vi.fn() },
    notification: { create: vi.fn() },
  },
  getObjectMock: vi.fn(),
  aiMock: { caption: vi.fn(), labels: vi.fn(), safety: vi.fn() },
}))

vi.mock('@camarin/db', () => ({ prisma: prismaMock }))
vi.mock('./storage', () => ({ getObject: getObjectMock }))
vi.mock('./ai', () => ({ createAiClient: () => aiMock }))
vi.mock('./env', () => ({ env: { PROCESSING_DELAY_MS: 0 } }))

import { createProcessor } from './processor'

const safe = {
  adult: 'VERY_UNLIKELY',
  spoof: 'UNLIKELY',
  medical: 'UNLIKELY',
  violence: 'VERY_UNLIKELY',
  racy: 'UNLIKELY',
}
const record = {
  id: 'job1',
  userId: 'u1',
  storageKey: 'users/u1/jobs/job1/original.jpg',
  originalFilename: 'photo.jpg',
  result: null,
}

// a stand-in BullMQ job
const job = (attemptsMade: number, attempts = 3) =>
  ({ data: { jobId: 'job1' }, opts: { attempts }, attemptsMade }) as never

const markedWith = (status: string) =>
  prismaMock.job.update.mock.calls.some(
    (c) => (c[0] as { data?: { status?: string } })?.data?.status === status,
  )

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.job.findUnique.mockResolvedValue(record)
  prismaMock.job.update.mockResolvedValue({})
  prismaMock.jobResult.upsert.mockResolvedValue({})
  prismaMock.notification.create.mockResolvedValue({})
  getObjectMock.mockResolvedValue(Buffer.from('img'))
  aiMock.caption.mockResolvedValue('a cat on a sofa')
  aiMock.labels.mockResolvedValue([{ description: 'Cat', score: 0.9 }])
  aiMock.safety.mockResolvedValue(safe)
})

describe('processor', () => {
  it('processes a job through to completed and writes the result', async () => {
    await createProcessor()(job(0))
    expect(markedWith('processing')).toBe(true)
    expect(markedWith('completed')).toBe(true)
    expect(prismaMock.jobResult.upsert).toHaveBeenCalled()
  })

  it('creates a notification when the safety check flags the image', async () => {
    aiMock.safety.mockResolvedValueOnce({ ...safe, adult: 'VERY_LIKELY' })
    await createProcessor()(job(0))
    expect(prismaMock.notification.create).toHaveBeenCalledOnce()
    expect(markedWith('completed')).toBe(true)
  })

  it('fails fast on a permanent error: marks failed, throws UnrecoverableError, no retry', async () => {
    aiMock.caption.mockRejectedValueOnce(new PermanentError('unprocessable image'))
    await expect(createProcessor()(job(0))).rejects.toBeInstanceOf(UnrecoverableError)
    expect(markedWith('failed')).toBe(true)
  })

  it('rethrows a transient error so BullMQ retries, without marking failed', async () => {
    aiMock.caption.mockRejectedValueOnce(new Error('vision timeout'))
    await expect(createProcessor()(job(0, 3))).rejects.toThrow('vision timeout')
    expect(markedWith('failed')).toBe(false)
    const recorded = prismaMock.job.update.mock.calls.find(
      (c) => 'lastError' in ((c[0] as { data?: object })?.data ?? {}),
    )
    expect((recorded?.[0] as { data: { lastError: string } }).data.lastError).toContain(
      'vision timeout',
    )
  })

  it('marks failed when a transient error hits on the last attempt', async () => {
    aiMock.caption.mockRejectedValueOnce(new Error('still down'))
    await expect(createProcessor()(job(2, 3))).rejects.toThrow('still down')
    expect(markedWith('failed')).toBe(true)
  })
})
