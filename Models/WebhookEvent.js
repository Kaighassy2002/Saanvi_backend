const mongoose = require('mongoose')

/**
 * Idempotency ledger for provider webhooks (Razorpay event.id).
 * Prevents replay of the same webhook delivery.
 */
const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, default: 'razorpay', index: true },
    eventId: { type: String, required: true },
    eventType: { type: String, default: '', index: true },
    status: {
      type: String,
      enum: ['processed', 'ignored', 'failed'],
      default: 'processed',
    },
    payloadSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorMessage: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
)

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true })
webhookEventSchema.index({ createdAt: -1 })

module.exports = mongoose.model('WebhookEvent', webhookEventSchema)
