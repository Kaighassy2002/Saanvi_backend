/**
 * Marketplace-style order lifecycle (Amazon / Myntra / Flipkart pattern).
 * Order status and payment status are independent.
 */

const ORDER_STATUSES = [
  'Placed',
  'Confirmed',
  'Packed',
  'Shipped',
  'Out For Delivery',
  'Delivered',
  'Cancelled',
  'Return Requested',
  'Returned',
]

const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'partially_refunded']

const RMA_STATUSES = ['', 'requested', 'received', 'restocked', 'refunded']

/** Forward fulfilment path */
const FULFILMENT_FLOW = [
  'Placed',
  'Confirmed',
  'Packed',
  'Shipped',
  'Out For Delivery',
  'Delivered',
]

const ORDER_TRANSITIONS = {
  Placed: ['Confirmed', 'Cancelled'],
  Confirmed: ['Packed', 'Cancelled'],
  Packed: ['Shipped', 'Cancelled'],
  Shipped: ['Out For Delivery', 'Delivered'],
  'Out For Delivery': ['Delivered'],
  Delivered: ['Return Requested'],
  'Return Requested': ['Returned', 'Delivered'],
  Returned: [],
  Cancelled: [],
}

const PAYMENT_TRANSITIONS = {
  pending: ['paid', 'failed'],
  paid: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded', 'partially_refunded'],
  failed: [],
  refunded: [],
}

const RESTOCK_STATUSES = new Set(['Cancelled', 'Returned'])

/** Statuses where customer self-cancel is allowed (before dispatch) */
const CUSTOMER_CANCEL_STATUSES = new Set(['Placed', 'Confirmed', 'Packed'])

function normalizePaymentMethod(method) {
  const key = String(method || '')
    .trim()
    .toLowerCase()
  if (key === 'razorpay' || key === 'online' || key === 'upi' || key === 'card') return 'razorpay'
  return 'cod'
}

function isCodPayment(method) {
  return normalizePaymentMethod(method) === 'cod'
}

/** Map legacy / internal statuses to marketplace labels */
function normalizeLegacyOrderStatus(status) {
  const s = String(status || 'Placed')
  const map = {
    Pending: 'Placed',
    Processing: 'Packed',
    Paid: 'Confirmed',
    'In Transit': 'Shipped',
  }
  return map[s] || s
}

/**
 * Initial persisted status after checkout completes.
 * Online: payment already captured → Confirmed + paid
 * COD: awaiting store confirmation → Placed + pending
 */
function getInitialOrderState(paymentMethod, paymentStatus) {
  const paid = String(paymentStatus || 'pending').toLowerCase() === 'paid'
  if (paid) {
    return { status: 'Confirmed', paymentStatus: 'paid' }
  }
  return { status: 'Placed', paymentStatus: 'pending' }
}

function validateOrderTransition(fromStatus, toStatus) {
  const from = normalizeLegacyOrderStatus(fromStatus)
  const to = normalizeLegacyOrderStatus(toStatus)
  if (from === to) return null
  const allowed = ORDER_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    return `Cannot change order status from ${from} to ${to}`
  }
  return null
}

function validatePaymentTransition(fromStatus, toStatus) {
  const from = String(fromStatus || 'pending').toLowerCase()
  const to = String(toStatus || '').toLowerCase()
  if (from === to) return null
  if (to === 'partially_refunded') return null
  const allowed = PAYMENT_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    return `Cannot change payment status from ${from} to ${to}`
  }
  return null
}

function canCustomerCancel(status) {
  return CUSTOMER_CANCEL_STATUSES.has(normalizeLegacyOrderStatus(status))
}

function canCustomerReturn(status) {
  return normalizeLegacyOrderStatus(status) === 'Delivered'
}

function shouldRestockOnStatus(status) {
  return RESTOCK_STATUSES.has(normalizeLegacyOrderStatus(status))
}

function isPreDispatch(status) {
  const s = normalizeLegacyOrderStatus(status)
  return ['Placed', 'Confirmed', 'Packed'].includes(s)
}

async function generateOrderPublicId(Order) {
  const now = new Date()
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const prefix = `ORD-${ymd}-`
  const count = await Order.countDocuments({ publicId: { $regex: `^${prefix}` } })
  return `${prefix}${1001 + count}`
}

function appendHistoryEntry(existing, entry) {
  const history = Array.isArray(existing) ? [...existing] : []
  history.push({
    status: entry.status,
    paymentStatus: entry.paymentStatus,
    note: String(entry.note || ''),
    at: entry.at || new Date(),
    by: String(entry.by || 'system'),
  })
  return history
}

/** Timeline written when order is first created */
function buildPlacementHistory({ paymentStatus, paymentMethod, by = 'system' }) {
  const at = new Date()
  const paid = String(paymentStatus || 'pending').toLowerCase() === 'paid'
  const cod = isCodPayment(paymentMethod)

  const history = [
    {
      status: 'Placed',
      paymentStatus: 'pending',
      note: 'Order placed',
      at,
      by,
    },
  ]

  if (paid) {
    history.push({
      status: 'Placed',
      paymentStatus: 'paid',
      note: 'Payment successful',
      at: new Date(at.getTime() + 1000),
      by,
    })
    history.push({
      status: 'Confirmed',
      paymentStatus: 'paid',
      note: 'Order confirmed',
      at: new Date(at.getTime() + 2000),
      by,
    })
  } else if (cod) {
    history.push({
      status: 'Placed',
      paymentStatus: 'pending',
      note: 'Cash on delivery — awaiting confirmation',
      at: new Date(at.getTime() + 1000),
      by,
    })
  }

  return history
}

/** COD: mark paid when order is delivered and cash collected */
function paymentStatusOnDelivered(existing) {
  if (
    isCodPayment(existing.paymentMethod) &&
    String(existing.paymentStatus || '').toLowerCase() === 'pending'
  ) {
    return 'paid'
  }
  return existing.paymentStatus
}

function formatPaymentStatusLabel(status) {
  const key = String(status || 'pending').toLowerCase()
  if (key === 'paid') return 'Paid'
  if (key === 'failed') return 'Failed'
  if (key === 'refunded') return 'Refunded'
  if (key === 'partially_refunded') return 'Partially refunded'
  return 'Pending'
}

/** Customer-facing step index for progress UI */
function fulfilmentStepIndex(status) {
  const s = normalizeLegacyOrderStatus(status)
  if (s === 'Cancelled' || s === 'Returned' || s === 'Return Requested') return -1
  const idx = FULFILMENT_FLOW.indexOf(s)
  return idx >= 0 ? idx : 0
}

function requiresCodConfirmation(order, threshold = 10000) {
  if (!isCodPayment(order.paymentMethod)) return false
  if (order.codConfirmedAt) return false
  const total = Number(order.total) || 0
  const limit = Number(threshold) || 10000
  return total >= limit
}

function canPackOrder(order, threshold = 10000) {
  if (!requiresCodConfirmation(order, threshold)) return null
  return 'High-value COD order must be confirmed before packing'
}

function generateRmaId(orderPublicId) {
  const base = String(orderPublicId || 'ORD').replace(/^ORD-/, '')
  return `RMA-${base}`
}

module.exports = {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  RMA_STATUSES,
  FULFILMENT_FLOW,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  normalizePaymentMethod,
  normalizeLegacyOrderStatus,
  isCodPayment,
  getInitialOrderState,
  validateOrderTransition,
  validatePaymentTransition,
  canCustomerCancel,
  canCustomerReturn,
  shouldRestockOnStatus,
  isPreDispatch,
  generateOrderPublicId,
  appendHistoryEntry,
  buildPlacementHistory,
  paymentStatusOnDelivered,
  formatPaymentStatusLabel,
  fulfilmentStepIndex,
  requiresCodConfirmation,
  canPackOrder,
  generateRmaId,
}
