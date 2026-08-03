const mongoose = require('mongoose')

/**
 * Immutable security / fraud / payment audit trail.
 * Separate from admin AuditLog so customer payment events are first-class.
 */
const securityEventSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: [
        'auth',
        'payment',
        'checkout',
        'order',
        'fraud',
        'webhook',
        'admin',
        'suspicious',
      ],
      required: true,
      index: true,
    },
    action: { type: String, required: true, index: true },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
      index: true,
    },
    actorType: {
      type: String,
      enum: ['customer', 'admin', 'system', 'anonymous'],
      default: 'system',
    },
    actorId: { type: String, default: '', index: true },
    actorEmail: { type: String, default: '' },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '', index: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    requestId: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
)

securityEventSchema.index({ category: 1, createdAt: -1 })
securityEventSchema.index({ action: 1, createdAt: -1 })

module.exports = mongoose.model('SecurityEvent', securityEventSchema)
