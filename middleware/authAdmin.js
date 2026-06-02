const jwt = require('jsonwebtoken')

function requireAdmin(req, res, next) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  const token = h.slice(7).trim()
  try {
    const payload = jwt.verify(token, secret)
    const role = String(payload.role || '').toLowerCase()
    const allowed = ['admin', 'superadmin', 'owner', 'catalog', 'fulfillment', 'support']
    if (!allowed.includes(role)) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

module.exports = { requireAdmin }
