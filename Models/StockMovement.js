const mongoose = require('mongoose')

const stockMovementSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  variantName: { type: String, default: '' },
  delta: { type: Number, required: true },
  movementType: {
    type: String,
    enum: [
      'adjust',
      'reserve',
      'release',
      'sale',
      'restock',
      'stock_take',
      'reorder_alert',
    ],
    default: 'adjust',
  },
  reason: { type: String, default: '' },
  adminId: { type: String, default: '' },
  adminEmail: { type: String, default: '' },
  orderId: { type: String, default: '' },
  stockAfter: { type: Number, default: 0 },
  reservedAfter: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
})

stockMovementSchema.index({ productId: 1, createdAt: -1 })

module.exports = mongoose.model('StockMovement', stockMovementSchema)
