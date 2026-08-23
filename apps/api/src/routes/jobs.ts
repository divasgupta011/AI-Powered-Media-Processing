import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { prisma } from '@camarin/db'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@camarin/shared'
import { ApiError, asyncHandler } from '../errors'
import { sniffImageType } from '../lib/imageType'
import { wakeWorker } from '../lib/wakeWorker'
import { requireAuth } from '../middleware/auth'
import { mediaQueue } from '../queue'
import { getObject, putObject } from '../storage'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
})

export const jobsRouter = Router()
jobsRouter.use(requireAuth)

jobsRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const userId = req.userId as string
    if (!req.file) throw new ApiError(400, 'no file uploaded (use form field "file")')

    const mime = sniffImageType(req.file.buffer)
    if (!mime) throw new ApiError(415, 'unsupported file type - only jpg, png and webp are allowed')

    const jobId = randomUUID()
    const key = `users/${userId}/jobs/${jobId}/original.${ALLOWED_MIME_TYPES[mime]}`

    await putObject(key, req.file.buffer, mime)

    const job = await prisma.job.create({
      data: {
        id: jobId,
        userId,
        status: 'pending',
        originalFilename: req.file.originalname,
        storageKey: key,
        mimeType: mime,
        sizeBytes: req.file.size,
      },
    })

    await mediaQueue.add('process', { jobId }, { jobId })
    wakeWorker()

    res.status(202).json({ jobId: job.id, status: job.status })
  }),
)

jobsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const jobs = await prisma.job.findMany({
      where: { userId: req.userId as string },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        originalFilename: true,
        flagged: true,
        flaggedCategory: true,
        createdAt: true,
      },
    })
    res.json({ jobs })
  }),
)

jobsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.userId as string },
      include: { result: true },
    })
    if (!job) throw new ApiError(404, 'job not found')
    res.json({ job })
  }),
)

jobsRouter.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.userId as string },
      select: { storageKey: true, mimeType: true },
    })
    if (!job) throw new ApiError(404, 'job not found')
    res.setHeader('content-type', job.mimeType)
    res.setHeader('cache-control', 'private, max-age=300')
    res.send(await getObject(job.storageKey))
  }),
)

jobsRouter.post(
  '/:id/retry',
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.userId as string },
    })
    if (!job) throw new ApiError(404, 'job not found')
    if (job.status !== 'failed') throw new ApiError(409, 'only failed jobs can be retried')

    // leave pipelineStage as-is so the worker resumes from where it failed
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'pending', lastError: null },
    })
    await mediaQueue.add('process', { jobId: job.id }, { jobId: `${job.id}:${Date.now()}` })
    wakeWorker()

    res.status(202).json({ jobId: job.id, status: 'pending' })
  }),
)
