const crypto = require('crypto')
const Razorpay = require('razorpay')
const { timingSafeEqualString } = require('./cryptoSafe')

const RAZORPAY_CURRENCY = 'INR'

function isRazorpayConfigured() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim()
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim()
  return Boolean(keyId && keySecret)
}

function getPublicKeyId() {
  return String(process.env.RAZORPAY_KEY_ID || '').trim()
}

function razorpayClient() {
  const keyId = getPublicKeyId()
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim()
  if (!keyId || !keySecret) return null
  return new Razorpay({ key_id: keyId, key_secret: keySecret })
}

/** @deprecated use timingSafeEqualString from cryptoSafe — kept for tests */
function timingSafeEqualHex(a, b) {
  return timingSafeEqualString(a, b)
}

function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim()
  if (!keySecret) return false
  const orderId = String(razorpayOrderId || '').trim()
  const paymentId = String(razorpayPaymentId || '').trim()
  const signature = String(razorpaySignature || '').trim()
  if (!orderId || !paymentId || !signature) return false

  const digest = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  return timingSafeEqualString(digest, signature)
}

/**
 * Verify Razorpay webhook signature.
 * Header: X-Razorpay-Signature = HMAC-SHA256(rawBody, webhookSecret)
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim()
  if (!webhookSecret) return false
  const signature = String(signatureHeader || '').trim()
  if (!signature || rawBody == null) return false

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8')
  const digest = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')
  return timingSafeEqualString(digest, signature)
}

/** Confirm payment is captured and amount matches storefront total (rupees). */
async function assertRazorpayPaymentCaptured(rp, { razorpayOrderId, razorpayPaymentId, expectedTotalInr }) {
  const payment = await rp.payments.fetch(razorpayPaymentId)
  if (!payment || payment.status !== 'captured') {
    throw new Error('Payment was not completed. Please try again.')
  }
  if (String(payment.order_id || '') !== String(razorpayOrderId)) {
    throw new Error('Payment does not match this order.')
  }
  const expectedPaise = Math.round(Number(expectedTotalInr) * 100)
  const paidPaise = Number(payment.amount)
  if (!Number.isFinite(paidPaise) || paidPaise !== expectedPaise) {
    throw new Error('Payment amount mismatch. Please refresh cart and try again.')
  }
  return payment
}

module.exports = {
  RAZORPAY_CURRENCY,
  isRazorpayConfigured,
  getPublicKeyId,
  razorpayClient,
  verifyPaymentSignature,
  verifyWebhookSignature,
  assertRazorpayPaymentCaptured,
  timingSafeEqualHex,
}
