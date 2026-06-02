const mongoose = require('mongoose')

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['percent', 'flat'], default: 'percent' },
    value: { type: Number, default: 0 },
    minOrder: { type: Number, default: 0 },
    maxUses: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
)

couponSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    const o = { ...ret }
    o.id = String(o._id)
    delete o._id
    delete o.__v
    return o
  },
})

module.exports = mongoose.model('Coupon', couponSchema)
