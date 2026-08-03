const mongoose = require('mongoose')
const { isRazorpayConfigured } = require('./helpers/razorpay')
const { isCloudinaryConfigured } = require('../config/cloudinary')
const { getRedisStatus } = require('../middleware/rateLimits')

/**
 * Liveness: process is up.
 * Readiness: DB connected (used by Render healthCheckPath).
 */
async function getHealth(req, res) {
  const dbState = mongoose.connection.readyState
  const dbOk = dbState === 1
  const deep = String(req.query.deep || '') === '1'

  const body = {
    ok: dbOk,
    service: 'jewellery-api',
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    checks: {
      mongodb: dbOk ? 'up' : 'down',
    },
  }

  if (deep) {
    const redis = getRedisStatus()
    body.checks.redis = redis.status
    body.checks.razorpay = isRazorpayConfigured() ? 'configured' : 'missing'
    body.checks.cloudinary = isCloudinaryConfigured() ? 'configured' : 'missing'
    body.memory = {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    }
  }

  res.status(dbOk ? 200 : 503).json(body)
}

module.exports = { getHealth }
