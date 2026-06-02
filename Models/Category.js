const mongoose = require('mongoose')

const categoryFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: '' },
    type: { type: String, enum: ['text', 'number', 'select'], default: 'text' },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
  },
  { _id: false }
)

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, default: '', trim: true },
    parentId: { type: String, default: '' },
    image: { type: String, default: '' },
    description: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    fieldDefinitions: { type: [categoryFieldSchema], default: [] },
  },
  { timestamps: true }
)

categorySchema.index({ slug: 1 })
categorySchema.index({ sortOrder: 1 })

categorySchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    const o = { ...ret }
    o.id = String(o._id)
    delete o._id
    delete o.__v
    return o
  },
})

module.exports = mongoose.model('Category', categorySchema)
