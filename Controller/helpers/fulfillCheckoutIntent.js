const mongoose = require('mongoose')
const Order = require('../../Models/Order')
const { isProduction } = require('../../config/isProduction')
const { createPaymentForOrder } = require('./orderPayments')
const { incrementCouponUsage } = require('./checkoutQuote')
const { consumeCheckoutIntent } = require('./checkoutIntent')
const {
  getInitialOrderState,
  generateOrderPublicId,
  buildPlacementHistory,
} = require('./orderWorkflow')
const {
  sendOrderConfirmationEmail,
  sendAdminNewOrderEmail,
} = require('./otpEmail')

/**
 * Create a paid storefront order from a reserved CheckoutIntent.
 * Used by client verify and Razorpay webhook (idempotent caller responsibility).
 */
async function fulfillPaidCheckoutIntent({
  intent,
  shipping,
  customerUserId,
  razorpayOrderId = '',
  razorpayPaymentId = '',
  instrument = '',
  source = 'verify',
  sendEmails = true,
}) {
  if (!intent || intent.status !== 'pending') {
    throw new Error('Checkout session is no longer valid. Please refresh cart and try again.')
  }
  if (intent.expiresAt && intent.expiresAt.getTime() < Date.now()) {
    throw new Error('Checkout session expired. Please refresh cart and try again.')
  }

  const customerName = `${shipping.firstName} ${shipping.lastName}`.trim()
  const publicId = await generateOrderPublicId(Order)
  const placedAt = new Date()
  const date = placedAt.toISOString().slice(0, 10)
  const paymentMethod = 'razorpay'
  const { status: initialStatus, paymentStatus: orderPaymentStatus } = getInitialOrderState(
    paymentMethod,
    'paid'
  )
  const couponId = intent.couponId || null

  const orderPayload = {
    publicId,
    date,
    placedAt,
    status: initialStatus,
    subtotal: intent.subtotal,
    shippingFee: intent.shippingFee,
    couponCode: intent.couponCode || '',
    couponDiscount: intent.couponDiscount,
    total: intent.total,
    customerEmail: shipping.email,
    customerName,
    shipping,
    paymentMethod,
    paymentStatus: orderPaymentStatus,
    trackingNumber: '',
    internalNotes: source === 'webhook' ? 'Fulfilled via Razorpay webhook' : '',
    placedVia: 'storefront',
    customerUserId: String(customerUserId),
    items: intent.verifiedItems,
    statusHistory: buildPlacementHistory({
      paymentStatus: orderPaymentStatus,
      paymentMethod,
      by: source === 'webhook' ? 'webhook' : 'system',
    }),
  }

  const session = await mongoose.startSession()
  let doc
  try {
    session.startTransaction()
    ;[doc] = await Order.create([orderPayload], { session })
    if (couponId) {
      await incrementCouponUsage(couponId, session)
    }
    await createPaymentForOrder({
      orderDoc: doc,
      paymentMethod,
      paymentStatus: orderPaymentStatus,
      razorpayOrderId,
      razorpayPaymentId,
      instrument,
      session,
    })
    await session.commitTransaction()
    await consumeCheckoutIntent(intent)
  } catch (err) {
    await session.abortTransaction()
    const msg = String(err?.message || '')
    const transactionUnavailable =
      msg.includes('Transaction numbers are only allowed on a replica set member') ||
      msg.includes('Transaction support is disabled')
    if (transactionUnavailable) {
      if (isProduction()) {
        throw new Error(
          'Order placement is temporarily unavailable. Database must support transactions in production.'
        )
      }
      doc = await Order.create(orderPayload)
      if (couponId) {
        await incrementCouponUsage(couponId)
      }
      await createPaymentForOrder({
        orderDoc: doc,
        paymentMethod,
        paymentStatus: orderPaymentStatus,
        razorpayOrderId,
        razorpayPaymentId,
        instrument,
      })
      await consumeCheckoutIntent(intent)
    } else {
      throw err
    }
  } finally {
    await session.endSession()
  }

  if (sendEmails && doc) {
    sendOrderConfirmationEmail({
      to: shipping.email,
      orderId: doc.publicId,
      customerName: doc.customerName,
      total: doc.total,
      itemCount: doc.items.length,
    }).catch((emailErr) => {
      console.error('Order confirmation email failed:', emailErr.message)
    })
    sendAdminNewOrderEmail({
      orderId: doc.publicId,
      customerName: doc.customerName,
      customerPhone: shipping.phone,
      customerEmail: shipping.email,
      total: doc.total,
      itemCount: doc.items.length,
      paymentMethod: doc.paymentMethod,
    }).catch((emailErr) => {
      console.error('Admin new-order email failed:', emailErr.message)
    })
  }

  return doc
}

module.exports = { fulfillPaidCheckoutIntent }
