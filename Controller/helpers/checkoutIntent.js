const Product = require('../../Models/Product')
const CheckoutIntent = require('../../Models/CheckoutIntent')
const { quoteCheckout, rollbackCheckoutReservations } = require('./checkoutQuote')

/** Razorpay checkout window — stock is held for this duration. */
const CHECKOUT_INTENT_TTL_MS = 20 * 60 * 1000

async function cleanupExpiredCheckoutIntents() {
  const now = new Date()
  const stale = await CheckoutIntent.find({
    status: 'pending',
    expiresAt: { $lte: now },
  }).limit(50)

  for (const intent of stale) {
    await releaseCheckoutIntent(intent, 'expired')
  }
  return stale.length
}

async function releaseCheckoutIntent(intent, nextStatus = 'expired') {
  if (!intent || intent.status !== 'pending') return intent
  const reservations = Array.isArray(intent.reservations) ? intent.reservations : []
  if (reservations.length) {
    await rollbackCheckoutReservations(reservations)
  }
  intent.status = nextStatus
  await intent.save()
  return intent
}

/**
 * Quote cart with stock reservation and persist a checkout intent (before Razorpay order id exists).
 * Shipping snapshot enables webhook-side order fulfillment without trusting client replay.
 */
async function createPendingCheckoutIntent({ customerUserId, items, couponCode = '', shipping = null }) {
  await cleanupExpiredCheckoutIntents()

  const quote = await quoteCheckout(items, { decrement: true, couponCode })
  const expiresAt = new Date(Date.now() + CHECKOUT_INTENT_TTL_MS)

  const intent = await CheckoutIntent.create({
    customerUserId: String(customerUserId),
    status: 'pending',
    verifiedItems: quote.verifiedItems,
    subtotal: quote.subtotal,
    shippingFee: quote.shippingFee,
    couponCode: quote.couponCode || '',
    couponDiscount: quote.couponDiscount,
    couponId: quote.couponId ? String(quote.couponId) : '',
    total: quote.total,
    shipping: shipping || null,
    reservations: quote.reservations || [],
    expiresAt,
  })

  return { intent, quote }
}

async function findCheckoutIntentByRazorpayOrderId(razorpayOrderId) {
  const rpId = String(razorpayOrderId || '').trim()
  if (!rpId) return null
  return CheckoutIntent.findOne({ razorpayOrderId: rpId, status: 'pending' })
}

async function attachRazorpayOrderToIntent(intentId, razorpayOrderId) {
  const intent = await CheckoutIntent.findById(intentId)
  if (!intent || intent.status !== 'pending') {
    throw new Error('Checkout session is no longer valid. Please refresh cart and try again.')
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    await releaseCheckoutIntent(intent, 'expired')
    throw new Error('Checkout session expired. Please refresh cart and try again.')
  }
  intent.razorpayOrderId = String(razorpayOrderId || '').trim()
  await intent.save()
  return intent
}

async function findActiveCheckoutIntent({ razorpayOrderId, customerUserId }) {
  await cleanupExpiredCheckoutIntents()
  const rpId = String(razorpayOrderId || '').trim()
  const userId = String(customerUserId || '').trim()
  if (!rpId || !userId) return null

  const intent = await CheckoutIntent.findOne({
    razorpayOrderId: rpId,
    customerUserId: userId,
    status: 'pending',
  })
  if (!intent) return null
  if (intent.expiresAt.getTime() < Date.now()) {
    await releaseCheckoutIntent(intent, 'expired')
    return null
  }
  return intent
}

async function consumeCheckoutIntent(intent) {
  if (!intent || intent.status !== 'pending') return intent
  intent.status = 'consumed'
  intent.reservations = []
  await intent.save()
  return intent
}

async function failCheckoutIntent(intent) {
  return releaseCheckoutIntent(intent, 'failed')
}

module.exports = {
  CHECKOUT_INTENT_TTL_MS,
  cleanupExpiredCheckoutIntents,
  releaseCheckoutIntent,
  createPendingCheckoutIntent,
  attachRazorpayOrderToIntent,
  findActiveCheckoutIntent,
  findCheckoutIntentByRazorpayOrderId,
  consumeCheckoutIntent,
  failCheckoutIntent,
}
