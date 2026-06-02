const Coupon = require('../Models/Coupon')
const { isValidObjectId } = require('./helpers/mongoIds')

async function adminListCoupons(_req, res) {
  const docs = await Coupon.find().sort({ createdAt: -1 })
  res.json({ coupons: docs.map((d) => d.toJSON()) })
}

async function adminCreateCoupon(req, res) {
  const body = req.body || {}
  const code = String(body.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ message: 'code required' })
  const doc = await Coupon.create({
    code,
    type: body.type || 'percent',
    value: Number(body.value) || 0,
    minOrder: Number(body.minOrder) || 0,
    maxUses: Number(body.maxUses) || 0,
    active: body.active !== false,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  })
  res.status(201).json(doc.toJSON())
}

async function adminUpdateCoupon(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Coupon not found' })
  const body = req.body || {}
  const updates = {}
  if (body.code !== undefined) updates.code = String(body.code).trim().toUpperCase()
  if (body.type !== undefined) updates.type = body.type
  if (body.value !== undefined) updates.value = Number(body.value)
  if (body.minOrder !== undefined) updates.minOrder = Number(body.minOrder)
  if (body.maxUses !== undefined) updates.maxUses = Number(body.maxUses)
  if (body.active !== undefined) updates.active = !!body.active
  if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  const doc = await Coupon.findByIdAndUpdate(id, { $set: updates }, { new: true })
  if (!doc) return res.status(404).json({ message: 'Coupon not found' })
  res.json(doc.toJSON())
}

async function adminDeleteCoupon(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Coupon not found' })
  await Coupon.findByIdAndDelete(id)
  res.status(204).end()
}

module.exports = {
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
}
