const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true })

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const apiRouter = require('./Routes/router')
const { isProduction } = require('./config/isProduction')
const { clientErrorMessage } = require('./Controller/helpers/httpError')
const { setupExpressErrorHandler } = require('./config/sentry')

function allowedOriginsFromEnv() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(compression())

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

  app.get('/', (_req, res) => {
    if (isProduction()) {
      return res.json({ ok: true, service: 'jewellery-api' })
    }
    res
      .status(200)
      .send(`<h1 style="color:red">Jewellery server started and waiting for client requests.</h1>`)
  })

  app.use((_req, res) => {
    res.status(404).json({ message: 'Not found' })
  })

  setupExpressErrorHandler(app)

  app.use((err, _req, res, _next) => {
    console.error(err)
    if (String(err?.message || '').includes('CORS blocked')) {
      return res.status(403).json({ message: 'Origin not allowed' })
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message })
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid id' })
    }
    res.status(500).json({ message: clientErrorMessage(err) })
  })

  return app
}

module.exports = { createApp }
