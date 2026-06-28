import crypto from 'node:crypto'
import { prisma } from '@camarin/db'
import { env } from '../env'
import { ApiError } from '../errors'

const DAY_MS = 24 * 60 * 60 * 1000

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function generate(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function expiry(): Date {
  return new Date(Date.now() + env.REFRESH_TTL_DAYS * DAY_MS)
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = generate()
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash(token), expiresAt: expiry() },
  })
  return token
}

export async function rotateRefreshToken(
  token: string,
): Promise<{ userId: string; refreshToken: string }> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(token) } })
  if (!row) throw new ApiError(401, 'invalid refresh token')

  // a revoked token coming back means someone replayed an old one - kill the whole family
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    throw new ApiError(401, 'refresh token reuse detected, please log in again')
  }
  if (row.expiresAt < new Date()) throw new ApiError(401, 'refresh token expired')

  const next = generate()
  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: { userId: row.userId, tokenHash: hash(next), expiresAt: expiry() },
    })
    const revoked = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: created.id },
    })
    if (revoked.count === 0) throw new ApiError(401, 'refresh token already used')
  })

  return { userId: row.userId, refreshToken: next }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
