const mongoose = require('mongoose')

/**
 * Refresh tokens are stored hashed. Rotation uses tokenFamily:
 * reuse of a revoked/old token in a family invalidates the whole family (theft detection).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    tokenFamily: { type: String, required: true, index: true },
    role: { type: String, enum: ['customer', 'admin'], required: true, index: true },
    subjectId: { type: String, required: true, index: true },
    subjectEmail: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
)

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('RefreshToken', refreshTokenSchema)
