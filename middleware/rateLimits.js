const rateLimit = require('express-rate-limit')
const logger = require('../Controller/helpers/logger')

let redisStatus = { status: 'memory', detail: 'REDIS_URL not set' }
let sharedStore

/**
 * Optional Redis store for multi-instance production.
 * Requires: ioredis + rate-limit-redis (declared in package.json)
 */
function buildStore() {
  const redisUrl = String(process.env.REDIS_URL || '').trim()
  if (!redisUrl) {
    redisStatus = { status: 'memory', detail: 'REDIS_URL not set' }
    return undefined
  }
  try {
    const { RedisStore } = require('rate-limit-redis')
    const Redis = require('ioredis')
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    client.on('ready', () => {
      redisStatus = { status: 'up', detail: 'connected' }
    })
    client.on('error', (err) => {
      redisStatus = { status: 'error', detail: err?.message || 'redis error' }
      logger.warn('redis_error', { error: err?.message || String(err) })
    })
    redisStatus = { status: 'connecting', detail: 'REDIS_URL set' }
    return new RedisStore({
      // ioredis: (command, ...args) => client.call(command, ...args)
      sendCommand: (command, ...args) => client.call(command, ...args),
      prefix: 'rl:jewellery:',
    })
  } catch (err) {
    redisStatus = {
      status: 'memory',
      detail: `fallback: ${err?.message || 'packages missing'}`,
    }
    logger.warn('redis_rate_limit_unavailable', { error: err?.message || String(err) })
    return undefined
  }
}

function getRedisStatus() {
  return { ...redisStatus }
}

function getSharedStore() {
  if (sharedStore === undefined) {
    sharedStore = buildStore() || null
  }
  return sharedStore || undefined
}

function makeLimiter(opts) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    store: getSharedStore(),
    ...opts,
  })
}

const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Too many attempts. Please try again later.' },
})

const forgotPasswordLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many password reset requests. Please try again later.' },
})

const orderLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: { message: 'Too many order requests. Please wait a moment and try again.' },
})

const paymentLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 8,
  message: { message: 'Too many payment attempts. Please wait a moment and try again.' },
})

const adminApiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: { message: 'Too many admin requests. Please slow down.' },
})

const publicApiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: { message: 'Too many requests. Please slow down.' },
})

const refreshLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: 'Too many session refresh attempts.' },
})

module.exports = {
  authLimiter,
  forgotPasswordLimiter,
  orderLimiter,
  paymentLimiter,
  adminApiLimiter,
  publicApiLimiter,
  refreshLimiter,
  getRedisStatus,
}
