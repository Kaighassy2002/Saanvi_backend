const { isProduction } = require('./isProduction')

const CUSTOMER_COOKIE = 'jewellery_customer_token'
const ADMIN_COOKIE = 'jewellery_admin_token'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProduction(),
  // Cross-origin storefront (Vercel) + API (Render) requires SameSite=None.
  sameSite: isProduction() ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
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

function setCustomerAuthCookie(res, token) {
  if (!token) return
  res.cookie(CUSTOMER_COOKIE, token, COOKIE_OPTS)
}

function setAdminAuthCookie(res, token) {
  if (!token) return
  res.cookie(ADMIN_COOKIE, token, COOKIE_OPTS)
}

function clearCustomerAuthCookie(res) {
  res.clearCookie(CUSTOMER_COOKIE, {
    path: COOKIE_OPTS.path,
    httpOnly: COOKIE_OPTS.httpOnly,
    sameSite: COOKIE_OPTS.sameSite,
    secure: COOKIE_OPTS.secure,
  })
}

function clearAdminAuthCookie(res) {
  res.clearCookie(ADMIN_COOKIE, {
    path: COOKIE_OPTS.path,
    httpOnly: COOKIE_OPTS.httpOnly,
    sameSite: COOKIE_OPTS.sameSite,
    secure: COOKIE_OPTS.secure,
  })
}

module.exports = {
  CUSTOMER_COOKIE,
  ADMIN_COOKIE,
  getBearerToken,
  setCustomerAuthCookie,
  setAdminAuthCookie,
  clearCustomerAuthCookie,
  clearAdminAuthCookie,
}
