const Product = require('../Models/Product')
const Order = require('../Models/Order')
const Payment = require('../Models/Payment')
const Customer = require('../Models/Customer')
const Review = require('../Models/Review')

/** Avoid crashing startup when an index already exists with same keys (e.g. unique from schema vs plain createIndex). */
async function safeCreateIndex(collection, spec, options = {}) {
  try {
    await collection.createIndex(spec, options)
  } catch (err) {
    const code = err?.code
    const codeName = err?.codeName
    if (
      code === 86 ||
      codeName === 'IndexKeySpecsConflict' ||
      codeName === 'IndexOptionsConflict' ||
      /already exists with different options/i.test(String(err?.message))
    ) {
      console.warn(`[ensureIndexes] skip conflicting index on ${collection.collectionName}:`, spec)
      return
    }
    throw err
  }
}

async function ensureIndexes() {
  await Promise.all([
    safeCreateIndex(Product.collection, { category: 1 }),
    safeCreateIndex(Product.collection, { published: 1 }),
    safeCreateIndex(Product.collection, { sku: 1 }),
    safeCreateIndex(Product.collection, { stock: 1 }),
    safeCreateIndex(Product.collection, { createdAt: -1 }),
    safeCreateIndex(Product.collection, { name: 'text', sku: 'text', category: 'text' }),
    safeCreateIndex(Order.collection, { status: 1 }),
    safeCreateIndex(Order.collection, { createdAt: -1 }),
    safeCreateIndex(Order.collection, { placedAt: -1 }),
    safeCreateIndex(Order.collection, { paymentMethod: 1 }),
    safeCreateIndex(Order.collection, { paymentStatus: 1 }),
    safeCreateIndex(Order.collection, { customerEmail: 1 }),
    // publicId: unique index is already created by Order schema — do not duplicate here
    safeCreateIndex(Payment.collection, { orderPublicId: 1 }),
    safeCreateIndex(Payment.collection, { razorpayPaymentId: 1 }, {
      unique: true,
      partialFilterExpression: { razorpayPaymentId: { $gt: '' } },
    }),
    safeCreateIndex(Payment.collection, { status: 1 }),
    safeCreateIndex(Payment.collection, { createdAt: -1 }),
    safeCreateIndex(Customer.collection, { email: 1 }),
    safeCreateIndex(Review.collection, { status: 1 }),
  ])
}

module.exports = { ensureIndexes }
