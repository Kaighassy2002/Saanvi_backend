const mongoose = require('mongoose')

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, default: '', trim: true },
    heroImage: { type: String, default: '' },
    description: { type: String, default: '' },
    productIds: { type: [String], default: [] },
    published: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
)

collectionSchema.index({ slug: 1 })

collectionSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    const o = { ...ret }
    o.id = String(o._id)
    delete o._id
    delete o.__v
    return o
  },
})

module.exports = mongoose.model('Collection', collectionSchema)
