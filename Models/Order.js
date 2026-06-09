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
  /** RMA workflow — structured returns ops */
  rmaId: { type: String, default: '' },
  rmaStatus: {
    type: String,
    enum: ['', 'requested', 'received', 'restocked', 'refunded'],
    default: '',
  },
  returnReceivedAt: { type: Date, default: null },
  returnRestockedAt: { type: Date, default: null },
  /** GST tax invoice number (defaults from ORD → INV mapping) */
  invoiceNumber: { type: String, default: '' },
  /** COD verification before packing high-value orders */
  codConfirmedAt: { type: Date, default: null },
  codConfirmedBy: { type: String, default: '' },
  courierAwb: { type: String, default: '' },
  courierShipmentId: { type: String, default: '' },
  trackingUrl: { type: String, default: '' },
  refunds: {
    type: [
      {
        amount: Number,
        currency: { type: String, default: 'INR' },
        reason: String,
        note: String,
        razorpayRefundId: String,
        provider: String,
        status: String,
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  /** True after reserved stock is committed to a sale (Packed or later) */
  stockCommitted: { type: Boolean, default: false },
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
