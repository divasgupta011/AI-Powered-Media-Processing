import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@camarin/db'
import { ApiError, asyncHandler } from '../errors'
import { signAccessToken } from '../lib/jwt'
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from '../lib/refresh'
import { requireAuth } from '../middleware/auth'

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'password must be at least 8 characters'),
})

const refreshBody = z.object({ refreshToken: z.string().min(1) })

async function issueSession(userId: string) {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: await issueRefreshToken(userId),
  }
}

export const authRouter = Router()

authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) throw new ApiError(409, 'email already registered')

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { email, passwordHash } })

    res.status(201).json({ ...(await issueSession(user.id)), user: { id: user.id, email } })
  }),
)

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ApiError(401, 'invalid email or password')
    }

    res.json({ ...(await issueSession(user.id)), user: { id: user.id, email: user.email } })
  }),
)

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body)
    const rotated = await rotateRefreshToken(refreshToken)
    res.json({ accessToken: signAccessToken(rotated.userId), refreshToken: rotated.refreshToken })
  }),
)

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body)
    await revokeRefreshToken(refreshToken)
    res.status(204).end()
  }),
)

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, createdAt: true },
    })
    if (!user) throw new ApiError(404, 'user not found')
    res.json({ user })
  }),
)
