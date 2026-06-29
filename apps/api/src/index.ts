import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { env } from './env'
import { errorHandler } from './errors'
import { authRouter } from './routes/auth'
import { jobsRouter } from './routes/jobs'
import { notificationsRouter } from './routes/notifications'

const app = express()

app.use(cors({ origin: env.CORS_ORIGIN.split(',') }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/auth', authRouter)
app.use('/jobs', jobsRouter)
app.use('/notifications', notificationsRouter)

app.use(errorHandler)

// honour a platform-assigned port (Render/Railway/Heroku-style), else our default
const port = Number(process.env.PORT) || env.API_PORT
app.listen(port, () => {
  console.log(`api listening on :${port}`)
})
