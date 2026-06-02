const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  status: { type: String, default: 'Processing' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  subtotal: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  customerEmail: { type: String, default: '' },
  customerName: { type: String, default: '' },
  shipping: { type: mongoose.Schema.Types.Mixed, default: {} },
  paymentMethod: { type: String, default: '' },
  razorpayOrderId: { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  internalNotes: { type: String, default: '' },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  placedVia: { type: String, default: '' },
  /** Mongo Customer _id when order placed while logged in */
  customerUserId: { type: String, default: '' },
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
