const { isProduction } = require('../config/isProduction')
const { logSecurityEvent } = require('../Controller/helpers/securityLog')

function allowedOriginsFromEnv() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim()
  if (!raw) {
    return ['http://localhost:5173', 'http://127.0.0.1:5173']
  }
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

/**
 * Defense-in-depth against CSRF for cookie-authenticated mutating requests.
 * Requires Origin (preferred) or Referer to match the CORS allowlist.
 * Skips when Authorization: Bearer is present (non-cookie clients / mobile).
 */
function requireSameOrigin(req, res, next) {
  const authHeader = String(req.headers.authorization || '')
  if (authHeader.startsWith('Bearer ')) {
    return next()
  }

  const allowed = allowedOriginsFromEnv()
  const origin = String(req.headers.origin || '').trim()
  if (origin && allowed.includes(origin)) {
    return next()
  }

  const referer = String(req.headers.referer || '').trim()
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin
      if (allowed.includes(refOrigin)) return next()
    } catch {
      /* ignore invalid referer */
    }
  }

  // In development, allow missing Origin for tools like Postman/curl.
  if (!isProduction() && !origin && !referer) {
    return next()
  }

  logSecurityEvent({
    category: 'suspicious',
    action: 'csrf_origin_blocked',
    severity: 'warning',
    actorType: 'anonymous',
    details: { path: req.path, method: req.method, origin, referer: referer.slice(0, 200) },
    req,
  })

  return res.status(403).json({ message: 'Request origin not allowed' })
}

module.exports = { requireSameOrigin, allowedOriginsFromEnv }
