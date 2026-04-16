const mongoose = require('mongoose')

const specificationsSchema = new mongoose.Schema(
  {
    material: { type: String, default: '' },
    weight: { type: String, default: '' },
    length: { type: String, default: '' },
    certification: { type: String, default: '' },
  },
  { _id: false }
)

const productSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    category: { type: String, default: '' },
    price: { type: Number, default: 0 },
    originalPrice: { type: Number, default: 0 },
    images: { type: [String], default: [] },
    description: { type: String, default: '' },
    specifications: { type: specificationsSchema, default: () => ({}) },
    published: { type: Boolean, default: true },
    stock: { type: Number, default: 10 },
  },
  { timestamps: true }
)

function toClientProduct(doc) {
  const plain = doc.toObject ? doc.toObject() : { ...doc }
  const id = plain._id != null ? String(plain._id) : plain.id
  const images =
    Array.isArray(plain.images) && plain.images.length > 0
      ? plain.images
      : plain.image
        ? [plain.image]
        : []
  return {
    id,
    name: plain.name || '',
    category: plain.category || '',
    price: Number(plain.price) || 0,
    originalPrice: Number(plain.originalPrice) || 0,
    image: images[0] || '',
    images,
    description: plain.description || '',
    specifications: plain.specifications || {
      material: '',
      weight: '',
      length: '',
      certification: '',
    },
    published: plain.published !== false,
    stock: plain.stock != null ? Number(plain.stock) : 10,
  }
}

productSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    return toClientProduct(ret)
  },
})

module.exports = mongoose.model('Product', productSchema)
module.exports.toClientProduct = toClientProduct
