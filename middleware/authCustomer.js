const jwt = require('jsonwebtoken')
const Customer = require('../Models/Customer')
const { getBearerToken } = require('../config/authCookies')
const { customerJwtSecret, VERIFY_OPTS } = require('../config/jwtSecrets')
const { logSecurityEvent } = require('../Controller/helpers/securityLog')

async function requireCustomer(req, res, next) {
  const secret = customerJwtSecret()
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const token = getBearerToken(req, 'customer')
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(token, secret, VERIFY_OPTS)
    const role = String(payload.role || '').toLowerCase()
    if (role !== 'customer') {
      await logSecurityEvent({
        category: 'auth',
        action: 'customer_role_mismatch',
        severity: 'warning',
        actorType: 'anonymous',
        details: { role },
        req,
      })
      return res.status(403).json({ message: 'Forbidden' })
    }
    const sub = payload.sub
    if (!sub) {
      return res.status(403).json({ message: 'Invalid token' })
    }
    const customer = await Customer.findById(sub).select('disabled email').lean()
    if (!customer || customer.disabled) {
      return res.status(403).json({ message: 'Account is disabled or not found' })
    }
    req.customer = {
      sub: String(sub),
      email: customer.email || payload.email,
      role: 'customer',
    }
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

module.exports = { requireCustomer }
