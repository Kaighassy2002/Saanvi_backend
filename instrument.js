const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true })

const Sentry = require('@sentry/node')
const { isProduction } = require('./config/isProduction')

const dsn = String(process.env.SENTRY_DSN || '').trim()
const enabled = Boolean(dsn) && isProduction()

if (enabled) {
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1)

  Sentry.init({
    dsn,
    enabled: true,
    environment: String(process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization
        delete event.request.headers.cookie
      }
      return event
    },
  })

  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)))
  })

  process.on('uncaughtException', (error) => {
    Sentry.captureException(error)
  })
}

module.exports = { Sentry, isSentryEnabled: enabled }
