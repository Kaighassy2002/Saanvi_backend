const mongoose = require('mongoose')

const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerName: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '', maxlength: 120 },
    body: { type: String, default: '', maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
)

reviewSchema.index({ productId: 1, customerId: 1 }, { unique: true })

function toClientReview(doc) {
  const plain = doc.toObject ? doc.toObject() : { ...doc }
  return {
    id: plain._id != null ? String(plain._id) : plain.id,
    productId: plain.productId != null ? String(plain.productId) : plain.productId,
    customerId: plain.customerId != null ? String(plain.customerId) : plain.customerId,
    customerName: plain.customerName || '',
    rating: Number(plain.rating) || 0,
    title: plain.title || '',
    body: plain.body || '',
    status: plain.status || 'pending',
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  }
}

reviewSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    return toClientReview(ret)
  },
})

module.exports = mongoose.model('Review', reviewSchema)
