const mongoose = require('mongoose')

const stockMovementSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  variantName: { type: String, default: '' },
  delta: { type: Number, required: true },
  reason: { type: String, default: '' },
  adminId: { type: String, default: '' },
  adminEmail: { type: String, default: '' },
  stockAfter: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
})

stockMovementSchema.index({ productId: 1, createdAt: -1 })

module.exports = mongoose.model('StockMovement', stockMovementSchema)
