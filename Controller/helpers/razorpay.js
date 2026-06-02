const crypto = require('crypto')
const Razorpay = require('razorpay')

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

function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim()
  if (!keySecret) return false
  const digest = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')
  return digest === razorpaySignature
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
  assertRazorpayPaymentCaptured,
}
