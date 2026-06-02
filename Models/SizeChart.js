const mongoose = require('mongoose')

const sizeRowSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    value: { type: String, default: '' },
  },
  { _id: false }
)

const sizeChartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['ring', 'bangle', 'bracelet', 'general'], default: 'general' },
    categoryIds: { type: [String], default: [] },
    rows: { type: [sizeRowSchema], default: [] },
  },
  { timestamps: true }
)

sizeChartSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    const o = { ...ret }
    o.id = String(o._id)
    delete o._id
    delete o.__v
    return o
  },
})

module.exports = mongoose.model('SizeChart', sizeChartSchema)
