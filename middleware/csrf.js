const { isProduction } = require('../config/isProduction')
const { timingSafeEqualString, randomToken } = require('../Controller/helpers/cryptoSafe')
const { logSecurityEvent } = require('../Controller/helpers/securityLog')
const {
  CUSTOMER_COOKIE,
  ADMIN_COOKIE,
  CSRF_COOKIE,
  setCsrfCookie,
  clearCsrfCookie,
} = require('../config/authCookies')
const { allowedOriginsFromEnv } = require('./requireSameOrigin')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function issueCsrfToken(res) {
  const token = randomToken(32)
  setCsrfCookie(res, token)
  return token
}

function originAllowed(req) {
  const allowed = allowedOriginsFromEnv()
  const origin = String(req.headers.origin || '').trim()
  if (origin && allowed.includes(origin)) return true

  const referer = String(req.headers.referer || '').trim()
  if (referer) {
    try {
      if (allowed.includes(new URL(referer).origin)) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

/**
 * Synchronizer-token CSRF for cookie sessions (cross-origin safe):
 * - Cookie `jewellery_csrf` is httpOnly and sent automatically
 * - Client sends the same value in `X-CSRF-Token` (obtained from /api/auth/csrf or login body)
 * - Origin/Referer must match allowlist when an auth cookie is present
 *
 * Skips: safe methods, Bearer-only auth (no session cookies), webhook paths.
 */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) {
    return next()
  }

  const hasCustomerCookie = Boolean(req.cookies?.[CUSTOMER_COOKIE])
  const hasAdminCookie = Boolean(req.cookies?.[ADMIN_COOKIE])
  const authHeader = String(req.headers.authorization || '')
  const bearerOnly = authHeader.startsWith('Bearer ') && !hasCustomerCookie && !hasAdminCookie

  if (bearerOnly) {
    return next()
  }

  // Mutating requests with session cookies (or establishing them via auth) need origin check in prod.
  if ((hasCustomerCookie || hasAdminCookie || req.path?.includes('/auth/')) && !originAllowed(req)) {
    if (!isProduction() && !req.headers.origin && !req.headers.referer) {
      // Local tooling without Origin
    } else {
      logSecurityEvent({
        category: 'suspicious',
        action: 'csrf_origin_blocked',
        severity: 'warning',
        actorType: 'anonymous',
        details: { path: req.originalUrl || req.path, method: req.method },
        req,
      })
      return res.status(403).json({ message: 'Request origin not allowed' })
    }
  }

  // Auth bootstrap endpoints issue cookies — require Origin but not prior CSRF token.
  const isAuthBootstrap =
    /^\/auth\/(login|register|google)$/.test(req.path) ||
    req.path === '/admin/auth/login' ||
    req.path === '/auth/refresh' ||
    req.path === '/admin/auth/refresh' ||
    req.path === '/auth/csrf'

  if (isAuthBootstrap) {
    return next()
  }

  if (!hasCustomerCookie && !hasAdminCookie) {
    return next()
  }

  const headerToken = String(req.headers['x-csrf-token'] || '').trim()
  const cookieToken = String(req.cookies?.[CSRF_COOKIE] || '').trim()
  if (!headerToken || !cookieToken || !timingSafeEqualString(headerToken, cookieToken)) {
    logSecurityEvent({
      category: 'suspicious',
      action: 'csrf_token_invalid',
      severity: 'warning',
      actorType: hasAdminCookie ? 'admin' : 'customer',
      details: { path: req.originalUrl || req.path, method: req.method },
      req,
    })
    return res.status(403).json({ message: 'Invalid CSRF token' })
  }

  return next()
}

async function getCsrfToken(req, res) {
  const token = issueCsrfToken(res)
  res.json({ csrfToken: token })
}

module.exports = {
  csrfProtection,
  getCsrfToken,
  issueCsrfToken,
  clearCsrfCookie,
}
