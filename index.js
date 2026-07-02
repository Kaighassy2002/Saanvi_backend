require('./instrument')

const mongoose = require('mongoose')
const { assertEnvValid } = require('./config/validateEnv')
const { createApp } = require('./app')

assertEnvValid()

const app = createApp()
const PORT = Number(process.env.PORT) || 5000
let server

async function start() {
  const { connectDb } = require('./DB/connection')
  await connectDb()
  await require('./DB/ensureIndexes').ensureIndexes()
  await require('./seed/seedIfNeeded')()

  const { publishDueProducts } = require('./Controller/helpers/scheduledPublish')
  publishDueProducts().catch((err) => console.error('Scheduled publish check failed:', err))
  setInterval(() => {
    publishDueProducts().catch((err) => console.error('Scheduled publish check failed:', err))
  }, 60 * 1000)

  const { cleanupExpiredCheckoutIntents } = require('./Controller/helpers/checkoutIntent')
  cleanupExpiredCheckoutIntents().catch((err) =>
    console.error('Checkout intent cleanup failed:', err?.message || err)
  )
  setInterval(() => {
    cleanupExpiredCheckoutIntents().catch((err) =>
      console.error('Checkout intent cleanup failed:', err?.message || err)
    )
  }, 5 * 60 * 1000)

  server = app.listen(PORT, () => {
    console.log(`Jewellery server started on port ${PORT}`)
  })
}

function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`)
  if (!server) {
    mongoose.disconnect().finally(() => process.exit(0))
    return
  }
  server.close(() => {
    mongoose.disconnect().finally(() => process.exit(0))
  })
  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start().catch((err) => {
  const { captureServerError } = require('./config/sentry')
  captureServerError(err, { tags: { source: 'startup' } })
  console.error(err)
  process.exit(1)
})

module.exports = { app, createApp }
