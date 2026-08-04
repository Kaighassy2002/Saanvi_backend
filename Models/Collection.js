const mongoose = require('mongoose')

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    heroImage: { type: String, default: '' },
    description: { type: String, default: '' },
    productIds: { type: [String], default: [] },
    /** draft when false; live when true and within schedule */
    published: { type: Boolean, default: false },
    /** When true (and published + in schedule), appears in homepage Featured Collections */
    showOnHomepage: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
)

collectionSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string', $gt: '' } } }
)
collectionSchema.index({ published: 1, sortOrder: 1, name: 1 })
collectionSchema.index({ showOnHomepage: 1, published: 1, sortOrder: 1 })
collectionSchema.index({ startsAt: 1, endsAt: 1 })

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
