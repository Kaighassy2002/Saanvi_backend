const WebhookEvent = require('../Models/WebhookEvent')
const {
  verifyWebhookSignature,
  assertRazorpayPaymentCaptured,
  razorpayClient,
  isRazorpayConfigured,
} = require('./helpers/razorpay')
const {
  findCheckoutIntentByRazorpayOrderId,
  failCheckoutIntent,
} = require('./helpers/checkoutIntent')
const { findPaymentByRazorpayId } = require('./helpers/orderPayments')
const { logSecurityEvent } = require('./helpers/securityLog')
const { refundCapturedRazorpayPayment } = require('./helpers/orderRefund')

/**
 * Razorpay webhook entrypoint.
 * Source of truth for capture events when the client never calls /razorpay-verify.
 *
 * Requires express.raw on this route (see app.js) so signature covers the exact body.
 */
async function razorpayWebhook(req, res) {
  const signature = req.headers['x-razorpay-signature']
  const rawBody = req.body

  if (!verifyWebhookSignature(rawBody, signature)) {
    await logSecurityEvent({
      category: 'webhook',
      action: 'razorpay_signature_invalid',
      severity: 'critical',
      actorType: 'system',
      details: {},
      req,
    })
    return res.status(400).json({ message: 'Invalid webhook signature' })
  }

  let event
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')
    event = JSON.parse(text)
  } catch {
    return res.status(400).json({ message: 'Invalid JSON' })
  }

  const eventId = String(event?.id || event?.event_id || '').trim()
  const eventType = String(event?.event || '').trim()
  if (!eventId) {
    return res.status(400).json({ message: 'Missing event id' })
  }

  try {
    await WebhookEvent.create({
      provider: 'razorpay',
      eventId,
      eventType,
      status: 'processed',
      payloadSummary: {
        entity: event?.payload?.payment?.entity?.id || event?.payload?.order?.entity?.id || '',
      },
    })
  } catch (err) {
    if (err?.code === 11000) {
      // Replay / duplicate delivery — acknowledge without reprocessing.
      await logSecurityEvent({
        category: 'webhook',
        action: 'razorpay_replay_ignored',
        severity: 'info',
        actorType: 'system',
        entityType: 'webhook',
        entityId: eventId,
        details: { eventType },
        req,
      })
      return res.status(200).json({ ok: true, duplicate: true })
    }
    throw err
  }

  try {
    if (eventType === 'payment.captured') {
      await handlePaymentCaptured(event, req)
    } else if (eventType === 'payment.failed') {
      await handlePaymentFailed(event, req)
    } else {
      await WebhookEvent.updateOne({ provider: 'razorpay', eventId }, { status: 'ignored' })
    }
  } catch (err) {
    await WebhookEvent.updateOne(
      { provider: 'razorpay', eventId },
      { status: 'failed', errorMessage: String(err?.message || '').slice(0, 500) }
    )
    await logSecurityEvent({
      category: 'webhook',
      action: 'razorpay_handler_failed',
      severity: 'critical',
      actorType: 'system',
      entityType: 'webhook',
      entityId: eventId,
      details: { eventType, error: String(err?.message || '').slice(0, 240) },
      req,
    })
    // Still 200 so Razorpay does not storm retries for permanent app bugs;
    // ops alerts come from SecurityEvent + failed webhook status.
    return res.status(200).json({ ok: false })
  }

  return res.status(200).json({ ok: true })
}

async function handlePaymentCaptured(event, req) {
  if (!isRazorpayConfigured()) return

  const paymentEntity = event?.payload?.payment?.entity
  const razorpayPaymentId = String(paymentEntity?.id || '').trim()
  const razorpayOrderId = String(paymentEntity?.order_id || '').trim()
  if (!razorpayPaymentId || !razorpayOrderId) return

  const existing = await findPaymentByRazorpayId(razorpayPaymentId)
  if (existing) {
    await logSecurityEvent({
      category: 'webhook',
      action: 'payment_already_fulfilled',
      severity: 'info',
      actorType: 'system',
      entityType: 'payment',
      entityId: razorpayPaymentId,
      details: { orderPublicId: existing.orderPublicId },
      req,
    })
    return
  }

  const intent = await findCheckoutIntentByRazorpayOrderId(razorpayOrderId)
  if (!intent) {
    await logSecurityEvent({
      category: 'fraud',
      action: 'captured_without_intent',
      severity: 'critical',
      actorType: 'system',
      entityType: 'razorpayOrder',
      entityId: razorpayOrderId,
      details: { razorpayPaymentId },
      req,
    })
    return
  }

  if (!intent.shipping) {
    await logSecurityEvent({
      category: 'payment',
      action: 'webhook_missing_shipping',
      severity: 'warning',
      actorType: 'system',
      entityType: 'checkoutIntent',
      entityId: String(intent._id),
      details: { razorpayOrderId, razorpayPaymentId },
      req,
    })
    // Client verify may still succeed if user returns; do not auto-refund yet.
    return
  }

  const rp = razorpayClient()
  await assertRazorpayPaymentCaptured(rp, {
    razorpayOrderId,
    razorpayPaymentId,
    expectedTotalInr: intent.total,
  })

  // Lazy require avoids circular dependency with userController.
  const { fulfillPaidCheckoutIntent } = require('./helpers/fulfillCheckoutIntent')

  try {
    const doc = await fulfillPaidCheckoutIntent({
      intent,
      shipping: intent.shipping,
      customerUserId: intent.customerUserId,
      razorpayOrderId,
      razorpayPaymentId,
      instrument: String(paymentEntity?.method || ''),
      source: 'webhook',
    })
    await logSecurityEvent({
      category: 'payment',
      action: 'order_created_via_webhook',
      severity: 'info',
      actorType: 'system',
      actorId: String(intent.customerUserId),
      entityType: 'order',
      entityId: doc.publicId,
      details: { razorpayPaymentId, razorpayOrderId },
      req,
    })
  } catch (err) {
    try {
      await refundCapturedRazorpayPayment({
        razorpayPaymentId,
        amountInr: intent.total,
        reason: 'webhook_order_creation_failed',
        note: String(err?.message || '').slice(0, 240),
      })
    } catch (refundErr) {
      console.error('Webhook auto-refund failed:', refundErr?.message || refundErr)
    }
    await failCheckoutIntent(intent).catch(() => {})
    throw err
  }
}

async function handlePaymentFailed(event, req) {
  const paymentEntity = event?.payload?.payment?.entity
  const razorpayOrderId = String(paymentEntity?.order_id || '').trim()
  if (!razorpayOrderId) return

  const intent = await findCheckoutIntentByRazorpayOrderId(razorpayOrderId)
  if (intent) {
    await failCheckoutIntent(intent).catch(() => {})
  }
  await logSecurityEvent({
    category: 'payment',
    action: 'payment_failed_webhook',
    severity: 'info',
    actorType: 'system',
    entityType: 'razorpayOrder',
    entityId: razorpayOrderId,
    details: {
      razorpayPaymentId: String(paymentEntity?.id || ''),
      errorCode: paymentEntity?.error_code || '',
    },
    req,
  })
}

module.exports = { razorpayWebhook }
