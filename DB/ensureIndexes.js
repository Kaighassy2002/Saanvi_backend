const Product = require('../Models/Product')
const Order = require('../Models/Order')
const Payment = require('../Models/Payment')
const Customer = require('../Models/Customer')
const Review = require('../Models/Review')
const CheckoutIntent = require('../Models/CheckoutIntent')
const SecurityEvent = require('../Models/SecurityEvent')
const WebhookEvent = require('../Models/WebhookEvent')
const RefreshToken = require('../Models/RefreshToken')

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
    // Products — storefront + admin listing
    safeCreateIndex(Product.collection, { category: 1 }),
    safeCreateIndex(Product.collection, { published: 1 }),
    safeCreateIndex(Product.collection, { sku: 1 }),
    safeCreateIndex(Product.collection, { stock: 1 }),
    safeCreateIndex(Product.collection, { createdAt: -1 }),
    safeCreateIndex(Product.collection, { published: 1, createdAt: -1 }),
    safeCreateIndex(Product.collection, { published: 1, stock: -1 }),
    safeCreateIndex(Product.collection, { published: 1, category: 1 }),
    safeCreateIndex(Product.collection, { featured: 1, published: 1 }),
    safeCreateIndex(Product.collection, { name: 'text', sku: 'text', category: 'text' }),

    // Orders — customer history, admin filters, analytics date ranges
    safeCreateIndex(Order.collection, { status: 1 }),
    safeCreateIndex(Order.collection, { createdAt: -1 }),
    safeCreateIndex(Order.collection, { placedAt: -1 }),
    safeCreateIndex(Order.collection, { date: -1 }),
    safeCreateIndex(Order.collection, { paymentMethod: 1 }),
    safeCreateIndex(Order.collection, { paymentStatus: 1 }),
    safeCreateIndex(Order.collection, { customerEmail: 1 }),
    safeCreateIndex(Order.collection, { customerUserId: 1, placedAt: -1 }),
    safeCreateIndex(Order.collection, { status: 1, placedAt: -1 }),
    safeCreateIndex(Order.collection, { paymentStatus: 1, placedAt: -1 }),
    // publicId: unique index is already created by Order schema — do not duplicate here

    // Payments
    safeCreateIndex(Payment.collection, { orderPublicId: 1 }),
    safeCreateIndex(Payment.collection, { razorpayPaymentId: 1 }, {
      unique: true,
      partialFilterExpression: { razorpayPaymentId: { $gt: '' } },
    }),
    safeCreateIndex(Payment.collection, { razorpayOrderId: 1 }),
    safeCreateIndex(Payment.collection, { status: 1 }),
    safeCreateIndex(Payment.collection, { createdAt: -1 }),
    safeCreateIndex(Payment.collection, { customerUserId: 1, createdAt: -1 }),

    // Customers
    safeCreateIndex(Customer.collection, { email: 1 }),
    safeCreateIndex(Customer.collection, { createdAt: -1 }),
    safeCreateIndex(Customer.collection, { disabled: 1, createdAt: -1 }),

    // Reviews / checkout / security
    safeCreateIndex(Review.collection, { status: 1 }),
    safeCreateIndex(Review.collection, { productId: 1, status: 1 }),
    safeCreateIndex(CheckoutIntent.collection, { razorpayOrderId: 1, customerUserId: 1, status: 1 }),
    safeCreateIndex(CheckoutIntent.collection, { status: 1, expiresAt: 1 }),
    safeCreateIndex(SecurityEvent.collection, { category: 1, createdAt: -1 }),
    safeCreateIndex(SecurityEvent.collection, { action: 1, createdAt: -1 }),
    safeCreateIndex(SecurityEvent.collection, { actorId: 1, createdAt: -1 }),
    safeCreateIndex(SecurityEvent.collection, { severity: 1, createdAt: -1 }),
    safeCreateIndex(WebhookEvent.collection, { provider: 1, eventId: 1 }, { unique: true }),
    safeCreateIndex(WebhookEvent.collection, { createdAt: -1 }),

    // Refresh tokens (TTL via schema expireAfterSeconds on expiresAt)
    safeCreateIndex(RefreshToken.collection, { tokenHash: 1 }, { unique: true }),
    safeCreateIndex(RefreshToken.collection, { tokenFamily: 1, revokedAt: 1 }),
    safeCreateIndex(RefreshToken.collection, { role: 1, subjectId: 1 }),
  ])
}

module.exports = { ensureIndexes }
