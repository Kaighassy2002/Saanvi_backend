const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true },
  /** YYYY-MM-DD for reporting / filters */
  date: { type: String, required: true },
  /** Full placement timestamp */
  placedAt: { type: Date, default: Date.now },
  status: { type: String, default: 'Placed' },
  paymentStatus: { type: String, default: 'pending' },
  subtotal: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  customerEmail: { type: String, default: '' },
  customerName: { type: String, default: '' },
  shipping: { type: mongoose.Schema.Types.Mixed, default: {} },
  paymentMethod: { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  courierPartner: { type: String, default: '' },
  estimatedDeliveryAt: { type: Date, default: null },
  cancelReason: { type: String, default: '' },
  returnReason: { type: String, default: '' },
  internalNotes: { type: String, default: '' },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  placedVia: { type: String, default: '' },
  /** Mongo Customer _id when order placed while logged in */
  customerUserId: { type: String, default: '' },
  cancellationRequestedAt: { type: Date, default: null },
  returnRequestedAt: { type: Date, default: null },
  statusHistory: {
    type: [
      {
        status: String,
        paymentStatus: String,
        note: String,
        at: { type: Date, default: Date.now },
        by: String,
      },
    ],
    default: [],
  },
})

orderSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    const o = { ...ret }
    o.id = o.publicId
    delete o._id
    delete o.__v
    delete o.publicId
    return o
  },
})

module.exports = mongoose.model('Order', orderSchema)
