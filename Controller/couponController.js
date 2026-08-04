const Coupon = require('../Models/Coupon')
const { isValidObjectId } = require('./helpers/mongoIds')
const { quoteCheckout } = require('./helpers/checkoutQuote')

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function normalizeType(type) {
  const t = String(type || 'percent').trim().toLowerCase()
  if (t === 'fixed' || t === 'flat') return 'flat'
  if (t === 'percent') return 'percent'
  return null
}

function parseExpiresAt(value) {
  if (value === null || value === '' || value === undefined) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { error: 'Expiry date is invalid' }
  return d
}

/**
 * @param {object} body
 * @param {{ requireCode?: boolean, checkExpiryPast?: boolean }} opts
 */
function validateCouponPayload(body, opts = {}) {
  const { requireCode = true, checkExpiryPast = true } = opts
  const errors = []
  const data = {}

  if (requireCode || body.code !== undefined) {
    const code = String(body.code || '')
      .trim()
      .toUpperCase()
    if (!code) {
      errors.push({ field: 'code', message: 'Coupon code is required' })
    } else if (!CODE_PATTERN.test(code)) {
      errors.push({
        field: 'code',
        message: 'Code must be 2–32 characters (letters, numbers, _ or -)',
      })
    } else {
      data.code = code
    }
  }

  if (body.type !== undefined || requireCode) {
    const type = normalizeType(body.type ?? 'percent')
    if (!type) {
      errors.push({ field: 'type', message: 'Type must be percent or flat' })
    } else {
      data.type = type
    }
  }

  if (body.value !== undefined || requireCode) {
    const value = Number(body.value)
    const effectiveType = data.type || normalizeType(body.type) || 'percent'
    if (!Number.isFinite(value) || value <= 0) {
      errors.push({ field: 'value', message: 'Discount value must be greater than 0' })
    } else if (effectiveType === 'percent' && value > 100) {
      errors.push({ field: 'value', message: 'Percent discount cannot exceed 100' })
    } else {
      data.value = value
    }
  }

  if (body.minOrder !== undefined || requireCode) {
    const minOrder = Number(body.minOrder ?? 0)
    if (!Number.isFinite(minOrder) || minOrder < 0) {
      errors.push({ field: 'minOrder', message: 'Minimum order must be 0 or greater' })
    } else {
      data.minOrder = minOrder
    }
  }

  if (body.maxUses !== undefined || requireCode) {
    const maxUses = Number(body.maxUses ?? 0)
    if (!Number.isFinite(maxUses) || maxUses < 0 || !Number.isInteger(maxUses)) {
      errors.push({ field: 'maxUses', message: 'Max uses must be a whole number ≥ 0 (0 = unlimited)' })
    } else {
      data.maxUses = maxUses
    }
  }

  if (body.active !== undefined) {
    data.active = !!body.active
  } else if (requireCode) {
    data.active = body.active !== false
  }

  if (body.expiresAt !== undefined || (requireCode && 'expiresAt' in body)) {
    const parsed = parseExpiresAt(body.expiresAt)
    if (parsed && parsed.error) {
      errors.push({ field: 'expiresAt', message: parsed.error })
    } else if (parsed && checkExpiryPast && parsed < startOfToday()) {
      errors.push({ field: 'expiresAt', message: 'Expiry date cannot be in the past' })
    } else {
      data.expiresAt = parsed
    }
  }

  return { data, errors }
}

function isDuplicateKeyError(err) {
  return err?.code === 11000 || /duplicate key/i.test(String(err?.message || ''))
}

async function adminListCoupons(_req, res) {
  const docs = await Coupon.find().sort({ createdAt: -1 })
  res.json({ coupons: docs.map((d) => d.toJSON()) })
}

async function adminCreateCoupon(req, res) {
  const body = req.body || {}
  const { data, errors } = validateCouponPayload(body, { requireCode: true, checkExpiryPast: true })
  if (errors.length) {
    return res.status(400).json({ message: errors[0].message, errors })
  }

  const existing = await Coupon.findOne({ code: data.code }).select('_id').lean()
  if (existing) {
    return res.status(409).json({
      message: `Coupon code "${data.code}" already exists`,
      errors: [{ field: 'code', message: 'This coupon code already exists' }],
    })
  }

  try {
    const doc = await Coupon.create({
      code: data.code,
      type: data.type,
      value: data.value,
      minOrder: data.minOrder,
      maxUses: data.maxUses,
      active: data.active,
      expiresAt: data.expiresAt ?? null,
    })
    res.status(201).json(doc.toJSON())
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({
        message: `Coupon code "${data.code}" already exists`,
        errors: [{ field: 'code', message: 'This coupon code already exists' }],
      })
    }
    throw err
  }
}

async function adminUpdateCoupon(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Coupon not found' })

  const existing = await Coupon.findById(id)
  if (!existing) return res.status(404).json({ message: 'Coupon not found' })

  const body = req.body || {}
  const willBeActive = body.active !== undefined ? !!body.active : existing.active !== false
  const { data, errors } = validateCouponPayload(body, {
    requireCode: false,
    // Reject past expiry when the coupon will remain/become active.
    checkExpiryPast:
      willBeActive &&
      body.expiresAt !== undefined &&
      body.expiresAt !== null &&
      body.expiresAt !== '',
  })
  if (errors.length) {
    return res.status(400).json({ message: errors[0].message, errors })
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update' })
  }

  // Block enabling a coupon that is already past expiry unless a new date is supplied.
  if (willBeActive && data.expiresAt === undefined && existing.expiresAt && existing.expiresAt < new Date()) {
    return res.status(400).json({
      message: 'This coupon has expired. Update the expiry date before enabling it.',
      errors: [{ field: 'expiresAt', message: 'Update the expiry date before enabling' }],
    })
  }

  if (data.code) {
    const clash = await Coupon.findOne({ code: data.code, _id: { $ne: id } })
      .select('_id')
      .lean()
    if (clash) {
      return res.status(409).json({
        message: `Coupon code "${data.code}" already exists`,
        errors: [{ field: 'code', message: 'This coupon code already exists' }],
      })
    }
  }

  try {
    const doc = await Coupon.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
    if (!doc) return res.status(404).json({ message: 'Coupon not found' })
    res.json(doc.toJSON())
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({
        message: `Coupon code "${data.code}" already exists`,
        errors: [{ field: 'code', message: 'This coupon code already exists' }],
      })
    }
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ message: err.message || 'Invalid coupon data' })
    }
    throw err
  }
}

async function adminDeleteCoupon(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Coupon not found' })
  const doc = await Coupon.findByIdAndDelete(id)
  if (!doc) return res.status(404).json({ message: 'Coupon not found' })
  res.status(204).end()
}

async function storefrontQuoteCoupon(req, res) {
  const body = req.body || {}
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return res.status(400).json({ message: 'Cart items required' })
  }
  const code = String(body.code || '').trim()
  if (!code) {
    return res.status(400).json({ message: 'Coupon code required' })
  }
  try {
    const quote = await quoteCheckout(items, { couponCode: code, decrement: false })
    res.json({
      valid: true,
      code: quote.couponCode,
      discount: quote.couponDiscount,
      subtotal: quote.subtotal,
      shippingFee: quote.shippingFee,
      total: quote.total,
    })
  } catch (err) {
    res.status(400).json({ valid: false, message: err?.message || 'Coupon could not be applied' })
  }
}

module.exports = {
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  storefrontQuoteCoupon,
  // exported for unit tests
  validateCouponPayload,
  normalizeType,
}
