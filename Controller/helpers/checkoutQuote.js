const Product = require('../../Models/Product')
const { isValidObjectId } = require('./mongoIds')
const { resolveAndMaybeDecrementLine, releaseReservation } = require('./orderLineStock')
const { getShippingSettings, computeShippingFee } = require('./siteSettings')
const { computeDiscount, incrementCouponUsage, resolveCoupon, round2 } = require('./couponCheckout')
const { enrichVerifiedItems } = require('./orderLineItems')

async function rollbackCheckoutReservations(reservations, session = null) {
  for (const undo of reservations || []) {
    if (!undo) continue
    try {
      await releaseReservation(Product, undo, session)
    } catch (err) {
      console.error('checkout reservation rollback failed:', err?.message || err)
    }
  }
}

async function getShippingFee(subtotal) {
  const shipping = await getShippingSettings()
  return computeShippingFee(subtotal, shipping)
}

function normalizeCheckoutLine(line) {
  const productId = String(line?.productId ?? '').trim()
  const quantity = Number(line?.quantity)
  const variantKey = String(line?.variantKey ?? line?.variantName ?? '').trim()
  return {
    productId,
    quantity,
    variantKey,
    variantName: variantKey,
    name: String(line?.name || '').trim(),
  }
}

async function quoteCheckoutLines(rawItems, { session = null, decrement = false } = {}) {
  const verifiedItems = []
  const reservations = []
  let subtotal = 0

  try {
    for (const rawLine of rawItems) {
      const line = normalizeCheckoutLine(rawLine)
      const quantity = line.quantity
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new Error('Invalid line item quantity')
      }
      if (!isValidObjectId(line.productId)) {
        throw new Error('Invalid product in cart')
      }
      const resolved = await resolveAndMaybeDecrementLine(
        Product,
        {
          productId: line.productId,
          quantity: line.quantity,
          variantKey: line.variantKey,
          variantName: line.variantName,
          name: line.name,
        },
        { session, decrement }
      )
      if (decrement && resolved.undo) reservations.push(resolved.undo)
      subtotal += resolved.price * line.quantity
      const item = {
        productId: resolved.productId,
        name: resolved.name,
        quantity: resolved.quantity,
        price: resolved.price,
        image: resolved.image,
      }
      if (resolved.variantName) item.variantName = resolved.variantName
      verifiedItems.push(item)
    }

    return { verifiedItems, subtotal: round2(subtotal), reservations }
  } catch (err) {
    if (decrement && reservations.length) {
      await rollbackCheckoutReservations(reservations, session)
    }
    throw err
  }
}

async function quoteCheckout(rawItems, { couponCode = '', session = null, decrement = false } = {}) {
  const { verifiedItems, subtotal, reservations } = await quoteCheckoutLines(rawItems, {
    session,
    decrement,
  })

  let coupon = null
  let couponDiscount = 0
  let couponId = null
  let appliedCode = ''

  const code = String(couponCode || '').trim()
  if (code) {
    coupon = await resolveCoupon(code, subtotal)
    couponDiscount = computeDiscount(coupon, subtotal)
    couponId = coupon._id
    appliedCode = coupon.code
  }

  const shippingFee = await getShippingFee(subtotal)
  const total = round2(Math.max(0, subtotal - couponDiscount) + shippingFee)
  const lineItems = enrichVerifiedItems(verifiedItems, subtotal, couponDiscount)

  return {
    verifiedItems: lineItems,
    subtotal,
    couponCode: appliedCode,
    couponDiscount,
    couponId,
    shippingFee,
    total,
    reservations: decrement ? reservations : [],
  }
}

module.exports = {
  quoteCheckout,
  quoteCheckoutLines,
  getShippingFee,
  incrementCouponUsage,
  rollbackCheckoutReservations,
  normalizeCheckoutLine,
}
