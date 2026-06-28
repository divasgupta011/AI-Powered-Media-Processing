import { Router } from 'express'
import { prisma } from '@camarin/db'
import { asyncHandler } from '../errors'
import { requireAuth } from '../middleware/auth'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId as string },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({ notifications })
  }),
)

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.userId as string },
      data: { read: true },
    })
    res.status(204).end()
  }),
)
