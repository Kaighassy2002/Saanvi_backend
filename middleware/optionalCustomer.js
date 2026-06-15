const jwt = require('jsonwebtoken')
const Customer = require('../Models/Customer')

/** Sets req.customer when a valid customer JWT is present; otherwise continues. */
async function optionalCustomer(req, _res, next) {
  const secret = process.env.JWT_SECRET
  if (!secret) return next()
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return next()
  const token = h.slice(7).trim()
  try {
    const payload = jwt.verify(token, secret)
    if (String(payload.role || '').toLowerCase() !== 'customer' || !payload.sub) {
      return next()
    }
    const customer = await Customer.findById(payload.sub).select('disabled email').lean()
    if (!customer || customer.disabled) {
      return next()
    }
    req.customer = {
      sub: String(payload.sub),
      email: customer.email || payload.email,
      role: 'customer',
    }
  } catch {
    /* ignore invalid token */
  }
  next()
}

module.exports = { optionalCustomer }
