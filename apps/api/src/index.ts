import 'dotenv/config'
import cors from 'cors'
import express from 'express'

const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const port = Number(process.env.API_PORT ?? 4000)
app.listen(port, () => {
  console.log(`api listening on :${port}`)
})
