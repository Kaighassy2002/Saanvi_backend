const { razorpayClient, isRazorpayConfigured } = require('./razorpay')
const Payment = require('../../Models/Payment')
const { orderPaymentStatusToRecordStatus } = require('./orderPayments')

/**
 * Process Razorpay refund and return audit record.
 * @param {{ order, payment, amountInr: number, reason?: string, note?: string, by?: string }} opts
 */
async function processRazorpayRefund(opts) {
  const { order, payment, amountInr, reason = '', note = '', by = 'admin' } = opts
  const rp = razorpayClient()
  if (!rp || !isRazorpayConfigured()) {
    throw new Error('Razorpay is not configured on the server')
  }
  const razorpayPaymentId = String(payment?.razorpayPaymentId || '').trim()
  if (!razorpayPaymentId) {
    throw new Error('No Razorpay payment ID found for this order')
  }

  const amountPaise = Math.round(Number(amountInr) * 100)
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error('Refund amount must be greater than zero')
  }

  const refund = await rp.payments.refund(razorpayPaymentId, {
    amount: amountPaise,
    notes: { reason: String(reason || note || 'Admin refund').slice(0, 255) },
  })

  const record = {
    amount: round2(amountInr),
    currency: 'INR',
    reason: String(reason || '').trim(),
    note: String(note || '').trim(),
    razorpayRefundId: String(refund.id || ''),
    status: String(refund.status || 'processed'),
    provider: 'razorpay',
    by: String(by || 'admin'),
    at: new Date(),
  }

  return record
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

/**
 * Resolve refund amount and next payment status.
 */
function resolveRefundPaymentStatus(orderTotal, existingRefunds, newAmount) {
  const prior = (existingRefunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalRefunded = round2(prior + newAmount)
  const orderAmount = round2(Number(orderTotal) || 0)
  if (totalRefunded >= orderAmount - 0.01) return 'refunded'
  return 'partially_refunded'
}

async function applyRefundToPayment(orderPublicId, paymentStatus) {
  const latest = await Payment.findOne({ orderPublicId: String(orderPublicId) }).sort({ createdAt: -1 })
  if (!latest) return null
  latest.status = orderPaymentStatusToRecordStatus(paymentStatus)
  await latest.save()
  return latest
}

module.exports = {
  processRazorpayRefund,
  resolveRefundPaymentStatus,
  applyRefundToPayment,
  round2,
}
