const { isProduction } = require('./isProduction')

const CUSTOMER_COOKIE = 'jewellery_customer_token'
const ADMIN_COOKIE = 'jewellery_admin_token'
const CUSTOMER_REFRESH_COOKIE = 'jewellery_customer_refresh'
const ADMIN_REFRESH_COOKIE = 'jewellery_admin_refresh'
const CSRF_COOKIE = 'jewellery_csrf'

function baseCookieOpts() {
  return {
    httpOnly: true,
    secure: isProduction(),
    // Cross-origin storefront (Vercel) + API (Render) requires SameSite=None.
    sameSite: isProduction() ? 'none' : 'lax',
    path: '/',
  }
}

function accessCookieMaxAgeMs() {
  // Access cookies mirror short-lived JWTs; refresh cookie holds the long session.
  const minutes = Number(process.env.JWT_ACCESS_COOKIE_MINUTES || 60)
  return Math.max(5, minutes) * 60 * 1000
}

function refreshCookieMaxAgeMs(role = 'customer') {
  const days =
    role === 'admin'
      ? Number(process.env.JWT_ADMIN_REFRESH_DAYS || 7)
      : Number(process.env.JWT_CUSTOMER_REFRESH_DAYS || 7)
  return Math.max(1, days) * 24 * 60 * 60 * 1000
}

/** Read JWT from httpOnly cookie first, then Authorization header (backward compatible). */
function getBearerToken(req, role = 'any') {
  const header = req.headers.authorization
  const fromHeader = header && header.startsWith('Bearer ') ? header.slice(7).trim() : ''

  const customerCookie = req.cookies?.[CUSTOMER_COOKIE]
  const adminCookie = req.cookies?.[ADMIN_COOKIE]

  if (role === 'customer') {
    return customerCookie || fromHeader || ''
  }
  if (role === 'admin') {
    return adminCookie || fromHeader || ''
  }
  return fromHeader || customerCookie || adminCookie || ''
}

function getRefreshToken(req, role) {
  if (role === 'admin') return String(req.cookies?.[ADMIN_REFRESH_COOKIE] || '')
  return String(req.cookies?.[CUSTOMER_REFRESH_COOKIE] || '')
}

function setCustomerAuthCookie(res, token) {
  if (!token) return
  res.cookie(CUSTOMER_COOKIE, token, {
    ...baseCookieOpts(),
    maxAge: accessCookieMaxAgeMs(),
  })
}

function setAdminAuthCookie(res, token) {
  if (!token) return
  res.cookie(ADMIN_COOKIE, token, {
    ...baseCookieOpts(),
    maxAge: accessCookieMaxAgeMs(),
  })
}

function setCustomerRefreshCookie(res, token) {
  if (!token) return
  res.cookie(CUSTOMER_REFRESH_COOKIE, token, {
    ...baseCookieOpts(),
    maxAge: refreshCookieMaxAgeMs('customer'),
  })
}

function setAdminRefreshCookie(res, token) {
  if (!token) return
  res.cookie(ADMIN_REFRESH_COOKIE, token, {
    ...baseCookieOpts(),
    maxAge: refreshCookieMaxAgeMs('admin'),
  })
}

function setCsrfCookie(res, token) {
  if (!token) return
  res.cookie(CSRF_COOKIE, token, {
    ...baseCookieOpts(),
    // Readable by server only; client receives token via JSON body.
    maxAge: refreshCookieMaxAgeMs('customer'),
  })
}

function clearCookie(res, name) {
  const opts = baseCookieOpts()
  res.clearCookie(name, {
    path: opts.path,
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
  })
}

function clearCustomerAuthCookie(res) {
  clearCookie(res, CUSTOMER_COOKIE)
  clearCookie(res, CUSTOMER_REFRESH_COOKIE)
}

function clearAdminAuthCookie(res) {
  clearCookie(res, ADMIN_COOKIE)
  clearCookie(res, ADMIN_REFRESH_COOKIE)
}

function clearCsrfCookie(res) {
  clearCookie(res, CSRF_COOKIE)
}

module.exports = {
  CUSTOMER_COOKIE,
  ADMIN_COOKIE,
  CUSTOMER_REFRESH_COOKIE,
  ADMIN_REFRESH_COOKIE,
  CSRF_COOKIE,
  getBearerToken,
  getRefreshToken,
  setCustomerAuthCookie,
  setAdminAuthCookie,
  setCustomerRefreshCookie,
  setAdminRefreshCookie,
  setCsrfCookie,
  clearCustomerAuthCookie,
  clearAdminAuthCookie,
  clearCsrfCookie,
}
