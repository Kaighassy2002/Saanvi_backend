const jwt = require('jsonwebtoken')
const Admin = require('../Models/Admin')
const { ALLOWED_ROLES } = require('./authAdminRoles')
const { getEffectivePermissions, sanitizePermissions } = require('./adminPermissions')
const { getBearerToken } = require('../config/authCookies')
const { adminJwtSecret, VERIFY_OPTS } = require('../config/jwtSecrets')

async function requireAdmin(req, res, next) {
  const secret = adminJwtSecret()
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const token = getBearerToken(req, 'admin')
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(token, secret, VERIFY_OPTS)
    const email = String(payload.email || '')
      .toLowerCase()
      .trim()
    if (!email) {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
    const admin = await Admin.findOne({ email })
      .select('email role permissions disabled name')
      .lean()
    if (!admin || admin.disabled) {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
    const dbRole = String(admin.role || 'owner').toLowerCase()
    if (!ALLOWED_ROLES.has(dbRole)) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    const jwtRole = String(payload.role || dbRole).toLowerCase()
    if (!ALLOWED_ROLES.has(jwtRole)) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    const effectivePermissions = [...getEffectivePermissions(admin)]
    req.admin = {
      email: admin.email,
      role: admin.role,
      name: admin.name || '',
      permissions: sanitizePermissions(admin.permissions),
      effectivePermissions,
      id: String(admin._id || ''),
    }
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

module.exports = { requireAdmin, ALLOWED_ROLES }
