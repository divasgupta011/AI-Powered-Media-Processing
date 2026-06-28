import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../env'

export function signAccessToken(userId: string): string {
  const opts: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'] }
  return jwt.sign({ sub: userId }, env.JWT_SECRET, opts)
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET)
  if (typeof payload === 'string' || !payload.sub) throw new Error('bad token')
  return payload.sub as string
}
