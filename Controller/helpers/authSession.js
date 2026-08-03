const jwt = require('jsonwebtoken')
const {
  setCustomerAuthCookie,
  setAdminAuthCookie,
  setCustomerRefreshCookie,
  setAdminRefreshCookie,
} = require('../../config/authCookies')
const {
  customerJwtSecret,
  adminJwtSecret,
  customerTokenExpiresIn,
  adminTokenExpiresIn,
} = require('../../config/jwtSecrets')
const {
  refreshEnabled,
  issueRefreshToken,
  customerRefreshTtlMs,
  adminRefreshTtlMs,
} = require('./refreshTokens')
const { issueCsrfToken } = require('../../middleware/csrf')

function signCustomerAccessToken(customer) {
  const secret = customerJwtSecret()
  return jwt.sign(
    { role: 'customer', sub: String(customer._id), email: customer.email },
    secret,
    { algorithm: 'HS256', expiresIn: customerTokenExpiresIn() }
  )
}

function signAdminAccessToken(admin) {
  const secret = adminJwtSecret()
  const role = admin.role || 'owner'
  return jwt.sign({ role, email: admin.email }, secret, {
    algorithm: 'HS256',
    expiresIn: adminTokenExpiresIn(),
  })
}

/**
 * Issue access (+ optional refresh) cookies and a CSRF token for the response body.
 */
async function establishCustomerSession(res, customer, req) {
  const accessToken = signCustomerAccessToken(customer)
  setCustomerAuthCookie(res, accessToken)

  let refreshIssued = false
  if (refreshEnabled()) {
    const { rawToken } = await issueRefreshToken({
      role: 'customer',
      subjectId: String(customer._id),
      subjectEmail: customer.email,
      req,
      ttlMs: customerRefreshTtlMs(),
    })
    setCustomerRefreshCookie(res, rawToken)
    refreshIssued = true
  }

  const csrfToken = issueCsrfToken(res)
  return { accessToken, csrfToken, refreshIssued }
}

async function establishAdminSession(res, admin, req) {
  const accessToken = signAdminAccessToken(admin)
  setAdminAuthCookie(res, accessToken)

  let refreshIssued = false
  if (refreshEnabled()) {
    const { rawToken } = await issueRefreshToken({
      role: 'admin',
      subjectId: String(admin._id || admin.email),
      subjectEmail: admin.email,
      req,
      ttlMs: adminRefreshTtlMs(),
    })
    setAdminRefreshCookie(res, rawToken)
    refreshIssued = true
  }

  const csrfToken = issueCsrfToken(res)
  return { accessToken, csrfToken, refreshIssued }
}

module.exports = {
  signCustomerAccessToken,
  signAdminAccessToken,
  establishCustomerSession,
  establishAdminSession,
}
