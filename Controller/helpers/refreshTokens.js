const crypto = require('crypto')
const RefreshToken = require('../../Models/RefreshToken')
const { sha256Hex, randomToken } = require('./cryptoSafe')
const { logSecurityEvent } = require('./securityLog')

function refreshEnabled() {
  return String(process.env.REFRESH_TOKENS_ENABLED || 'true').toLowerCase() !== 'false'
}

function customerRefreshTtlMs() {
  const days = Number(process.env.JWT_CUSTOMER_REFRESH_DAYS || 7)
  return Math.max(1, days) * 24 * 60 * 60 * 1000
}

function adminRefreshTtlMs() {
  const days = Number(process.env.JWT_ADMIN_REFRESH_DAYS || 7)
  return Math.max(1, days) * 24 * 60 * 60 * 1000
}

function hashRefreshToken(raw) {
  return sha256Hex(raw)
}

/**
 * Issue a new refresh token (optionally continuing a family for rotation).
 * @returns {{ rawToken: string, doc: import('mongoose').Document }}
 */
async function issueRefreshToken({
  role,
  subjectId,
  subjectEmail = '',
  tokenFamily = '',
  req = null,
  ttlMs,
}) {
  const rawToken = randomToken(48)
  const tokenHash = hashRefreshToken(rawToken)
  const family = tokenFamily || crypto.randomUUID()
  const expiresAt = new Date(Date.now() + ttlMs)
  const ip =
    (typeof req?.ip === 'string' && req.ip) ||
    String(req?.headers?.['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    ''
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 300)

  const doc = await RefreshToken.create({
    tokenHash,
    tokenFamily: family,
    role,
    subjectId: String(subjectId),
    subjectEmail: String(subjectEmail || '').toLowerCase(),
    expiresAt,
    userAgent,
    ip,
  })

  return { rawToken, doc }
}

async function revokeTokenFamily(tokenFamily, reason = 'logout') {
  const family = String(tokenFamily || '').trim()
  if (!family) return 0
  const result = await RefreshToken.updateMany(
    { tokenFamily: family, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )
  return result.modifiedCount || 0
}

async function revokeAllForSubject(role, subjectId) {
  const result = await RefreshToken.updateMany(
    { role, subjectId: String(subjectId), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )
  return result.modifiedCount || 0
}

/**
 * Rotate refresh token. Detects reuse of revoked tokens (possible theft).
 * @returns {{ rawToken: string, doc: import('mongoose').Document, subjectId: string, subjectEmail: string, role: string }}
 */
async function rotateRefreshToken(rawToken, { role, req = null }) {
  const hash = hashRefreshToken(rawToken)
  const existing = await RefreshToken.findOne({ tokenHash: hash, role })
  if (!existing) {
    const err = new Error('Invalid refresh token')
    err.status = 401
    throw err
  }

  if (existing.revokedAt) {
    await revokeTokenFamily(existing.tokenFamily, 'reuse_detected')
    await logSecurityEvent({
      category: 'auth',
      action: 'refresh_token_reuse',
      severity: 'critical',
      actorType: role,
      actorId: existing.subjectId,
      actorEmail: existing.subjectEmail,
      details: { tokenFamily: existing.tokenFamily },
      req,
    })
    const err = new Error('Refresh token reuse detected — session revoked')
    err.status = 401
    throw err
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    existing.revokedAt = new Date()
    await existing.save()
    const err = new Error('Refresh token expired')
    err.status = 401
    throw err
  }

  const ttlMs = role === 'admin' ? adminRefreshTtlMs() : customerRefreshTtlMs()
  const rotated = await issueRefreshToken({
    role,
    subjectId: existing.subjectId,
    subjectEmail: existing.subjectEmail,
    tokenFamily: existing.tokenFamily,
    req,
    ttlMs,
  })

  existing.revokedAt = new Date()
  existing.replacedByHash = rotated.doc.tokenHash
  await existing.save()

  return {
    rawToken: rotated.rawToken,
    doc: rotated.doc,
    subjectId: existing.subjectId,
    subjectEmail: existing.subjectEmail,
    role,
  }
}

async function revokeByRawToken(rawToken, role) {
  const hash = hashRefreshToken(rawToken)
  const existing = await RefreshToken.findOne({ tokenHash: hash, role })
  if (!existing) return false
  await revokeTokenFamily(existing.tokenFamily, 'logout')
  return true
}

module.exports = {
  refreshEnabled,
  customerRefreshTtlMs,
  adminRefreshTtlMs,
  issueRefreshToken,
  rotateRefreshToken,
  revokeByRawToken,
  revokeAllForSubject,
  revokeTokenFamily,
  hashRefreshToken,
}
