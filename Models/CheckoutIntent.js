const mongoose = require('mongoose')

/**
 * Holds stock reservations + quoted totals between Razorpay order creation and payment verify.
 * Prevents overselling and ties captured payments to a server-side quote snapshot.
 */
const checkoutIntentSchema = new mongoose.Schema({
  customerUserId: { type: String, required: true, index: true },
  razorpayOrderId: { type: String, default: '', trim: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'consumed', 'expired', 'failed'],
    default: 'pending',
    index: true,
  },
  verifiedItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
  subtotal: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },
  couponDiscount: { type: Number, default: 0 },
  couponId: { type: String, default: '' },
  total: { type: Number, default: 0 },
  /** Stock reservation undo payloads from checkoutQuote (released on expiry/failure). */
  reservations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('CheckoutIntent', checkoutIntentSchema)
