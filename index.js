require('dotenv').config({ override: true })
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { connectDb } = require('./DB/connection')
const apiRouter = require('./Routes/router')

const app = express()
app.set('trust proxy', 1)
app.use(helmet())

function allowedOriginsFromEnv() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

const allowedOrigins = allowedOriginsFromEnv()
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (allowedOrigins.length === 0) {
        if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
          return cb(null, true)
        }
        return cb(new Error('CORS blocked for origin'))
      }
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(new Error('CORS blocked for origin'))
    },
  })
)
app.use(express.json({ limit: '1mb' }))
app.use('/api', apiRouter)

const PORT = Number(process.env.PORT) || 5000

app.get('/', (_req, res) => {
  res
    .status(200)
    .send(`<h1 style="color:red">Jewellary Server start and waiting for client Request!!!</h1>`)
})

connectDb()
  .then(() => require('./DB/ensureIndexes').ensureIndexes())
  .then(() => require('./seed/seedIfNeeded')())
  .then(() => {
    const { publishDueProducts } = require('./Controller/helpers/scheduledPublish')
    publishDueProducts().catch((err) => console.error('Scheduled publish check failed:', err))
    setInterval(() => {
      publishDueProducts().catch((err) => console.error('Scheduled publish check failed:', err))
    }, 60 * 1000)

    app.listen(PORT, () => {
      console.log(`Jewellary Server start at port :${PORT}`)
    })
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
