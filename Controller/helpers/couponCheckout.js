const Coupon = require('../../Models/Coupon')

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function computeDiscount(coupon, subtotal) {
  const base = Math.max(0, Number(subtotal) || 0)
  const value = Number(coupon?.value) || 0
  if (String(coupon?.type || '').toLowerCase() === 'flat') {
    return round2(Math.min(value, base))
  }
  return round2((base * value) / 100)
}

async function resolveCoupon(code, subtotal) {
  const normalized = String(code || '').trim().toUpperCase()
  if (!normalized) return null

  const coupon = await Coupon.findOne({ code: normalized })
  if (!coupon) throw new Error('Invalid coupon code')
  if (!coupon.active) throw new Error('This coupon is no longer active')
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new Error('This coupon has expired')
  }
  const minOrder = Number(coupon.minOrder) || 0
  if (minOrder > 0 && subtotal < minOrder) {
    throw new Error(`Minimum order ₹${minOrder.toLocaleString('en-IN')} required for this coupon`)
  }
  const maxUses = Number(coupon.maxUses) || 0
  if (maxUses > 0 && Number(coupon.usedCount) >= maxUses) {
    throw new Error('This coupon has reached its usage limit')
  }
  return coupon
}

async function incrementCouponUsage(couponId, session = null) {
  if (!couponId) return null
  const opts = { new: true }
  if (session) opts.session = session
  const updated = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
    },
    { $inc: { usedCount: 1 } },
    opts
  )
  if (!updated) throw new Error('Coupon is no longer available')
  return updated
}

module.exports = {
  round2,
  computeDiscount,
  resolveCoupon,
  incrementCouponUsage,
}
