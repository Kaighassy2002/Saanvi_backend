/**
 * One-time migration: copy legacy razorpay fields from orders into payments collection.
 * Run: node seed/migrateOrderPayments.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const Order = require('../Models/Order')
const Payment = require('../Models/Payment')
const { createPaymentForOrder } = require('../Controller/helpers/orderPayments')

async function migrate() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) {
    console.error('Set MONGO_URI or MONGODB_URI in .env')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  const orders = await Order.find({}).lean()
  let created = 0
  let skipped = 0

  for (const order of orders) {
    const existing = await Payment.countDocuments({ orderPublicId: order.publicId })
    if (existing > 0) {
      skipped += 1
      continue
    }

    const legacyRazorpayOrderId = String(order.razorpayOrderId || '')
    const legacyRazorpayPaymentId = String(order.razorpayPaymentId || '')

    const orderDoc = await Order.findById(order._id)
    if (!orderDoc) continue

    await createPaymentForOrder({
      orderDoc,
      paymentMethod: order.paymentMethod || 'cod',
      paymentStatus: order.paymentStatus || 'pending',
      razorpayOrderId: legacyRazorpayOrderId,
      razorpayPaymentId: legacyRazorpayPaymentId,
    })
    created += 1
  }

  console.log(`Migration complete. Created ${created} payment records, skipped ${skipped} orders.`)
  await mongoose.disconnect()
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
