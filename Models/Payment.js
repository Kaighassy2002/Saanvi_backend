const mongoose = require('mongoose')

const paymentSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true },
    orderRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderPublicId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    /** Checkout gateway: razorpay | cod */
    provider: { type: String, enum: ['razorpay', 'cod'], default: 'cod' },
    /** Actual instrument when known: upi, card, netbanking, wallet, cod */
    instrument: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'captured', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending',
    },
    razorpayOrderId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    customerUserId: { type: String, default: '' },
  },
  { timestamps: true }
)

paymentSchema.set('toJSON', {
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

module.exports = mongoose.model('Payment', paymentSchema)
