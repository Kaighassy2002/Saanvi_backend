/**
 * JWT secret resolution.
 * Prefer split secrets in production (JWT_CUSTOMER_SECRET / JWT_ADMIN_SECRET).
 * Falls back to JWT_SECRET for backward compatibility.
 *
 * With refresh tokens enabled (default), access tokens are short-lived.
 * Set REFRESH_TOKENS_ENABLED=false to keep long-lived access tokens.
 */

function refreshTokensEnabled() {
  return String(process.env.REFRESH_TOKENS_ENABLED || 'true').toLowerCase() !== 'false'
}

function customerJwtSecret() {
  return (
    String(process.env.JWT_CUSTOMER_SECRET || '').trim() ||
    String(process.env.JWT_SECRET || '').trim()
  )
}

function adminJwtSecret() {
  return (
    String(process.env.JWT_ADMIN_SECRET || '').trim() ||
    String(process.env.JWT_SECRET || '').trim()
  )
}

/** Access-token TTL — short when refresh rotation is enabled. */
function customerTokenExpiresIn() {
  if (process.env.JWT_CUSTOMER_EXPIRES_IN) {
    return String(process.env.JWT_CUSTOMER_EXPIRES_IN).trim()
  }
  return refreshTokensEnabled() ? '15m' : '7d'
}

function adminTokenExpiresIn() {
  if (process.env.JWT_ADMIN_EXPIRES_IN) {
    return String(process.env.JWT_ADMIN_EXPIRES_IN).trim()
  }
  return refreshTokensEnabled() ? '15m' : '8h'
}

const VERIFY_OPTS = Object.freeze({
  algorithms: ['HS256'],
})

module.exports = {
  customerJwtSecret,
  adminJwtSecret,
  customerTokenExpiresIn,
  adminTokenExpiresIn,
  refreshTokensEnabled,
  VERIFY_OPTS,
}
