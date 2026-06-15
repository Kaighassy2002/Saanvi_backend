const crypto = require('crypto')
const Payment = require('../../Models/Payment')

function generatePaymentPublicId() {
  return `PAY-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

/** Map order.summary paymentStatus → payment record status */
function orderPaymentStatusToRecordStatus(orderPaymentStatus) {
  const key = String(orderPaymentStatus || 'pending').toLowerCase()
  if (key === 'paid') return 'captured'
  if (['pending', 'failed', 'refunded', 'partially_refunded'].includes(key)) return key
  return 'pending'
}

/** Map payment record status → order.summary paymentStatus */
function recordStatusToOrderPaymentStatus(recordStatus) {
  const key = String(recordStatus || 'pending').toLowerCase()
  if (key === 'captured') return 'paid'
  if (['pending', 'failed', 'refunded', 'partially_refunded'].includes(key)) return key
  return 'pending'
}

function resolveProvider(paymentMethod) {
  const key = String(paymentMethod || '')
    .trim()
    .toLowerCase()
  if (key === 'razorpay' || key === 'online' || key === 'upi' || key === 'card') return 'razorpay'
  return 'cod'
}

/**
 * @param {{
 *   orderDoc: import('mongoose').Document,
 *   paymentMethod: string,
 *   paymentStatus: string,
 *   razorpayOrderId?: string,
 *   razorpayPaymentId?: string,
 *   instrument?: string,
 *   session?: import('mongoose').ClientSession | null,
 * }} opts
 */
async function createPaymentForOrder(opts) {
  const {
    orderDoc,
    paymentMethod,
    paymentStatus,
    razorpayOrderId = '',
    razorpayPaymentId = '',
    instrument = '',
    session = null,
  } = opts

  const provider = resolveProvider(paymentMethod)
  const payload = {
    publicId: generatePaymentPublicId(),
    orderRef: orderDoc._id,
    orderPublicId: orderDoc.publicId,
    amount: Number(orderDoc.total) || 0,
    currency: 'INR',
    provider,
    instrument: instrument || (provider === 'cod' ? 'cod' : ''),
    status: orderPaymentStatusToRecordStatus(paymentStatus),
    razorpayOrderId: String(razorpayOrderId || ''),
    razorpayPaymentId: String(razorpayPaymentId || ''),
    customerUserId: String(orderDoc.customerUserId || ''),
  }

  if (session) {
    const [doc] = await Payment.create([payload], { session })
    return doc
  }
  return Payment.create(payload)
}

async function listPaymentsForOrderPublicId(orderPublicId) {
  return Payment.find({ orderPublicId: String(orderPublicId) }).sort({ createdAt: -1 })
}

async function syncLatestPaymentStatus(orderPublicId, orderPaymentStatus) {
  const latest = await Payment.findOne({ orderPublicId: String(orderPublicId) }).sort({ createdAt: -1 })
  if (!latest) return null
  latest.status = orderPaymentStatusToRecordStatus(orderPaymentStatus)
  await latest.save()
  return latest
}

async function findPaymentByRazorpayId(razorpayPaymentId) {
  const id = String(razorpayPaymentId || '').trim()
  if (!id) return null
  return Payment.findOne({ razorpayPaymentId: id, provider: 'razorpay' })
}

module.exports = {
  createPaymentForOrder,
  listPaymentsForOrderPublicId,
  syncLatestPaymentStatus,
  findPaymentByRazorpayId,
  orderPaymentStatusToRecordStatus,
  recordStatusToOrderPaymentStatus,
  resolveProvider,
}
