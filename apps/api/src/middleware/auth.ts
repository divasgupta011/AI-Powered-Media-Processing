import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../errors'
import { verifyAccessToken } from '../lib/jwt'

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, 'missing bearer token')
  }
  try {
    req.userId = verifyAccessToken(header.slice(7))
  } catch {
    throw new ApiError(401, 'invalid or expired token')
  }
  next()
}
