const crypto = require('crypto')
const { round2 } = require('./orderRefund')
const { canCustomerCancel, canCustomerReturn, normalizeLegacyOrderStatus } = require('./orderWorkflow')

/** Per-line fulfilment / after-sales status */
const LINE_STATUSES = [
  'active',
  'cancelled',
  'return_requested',
  'return_received',
  'returned',
  'refunded',
]

const LINE_STATUS_LABELS = {
  active: 'Active',
  cancelled: 'Cancelled',
  return_requested: 'Return requested',
  return_received: 'Return received',
  returned: 'Returned',
  refunded: 'Refunded',
}

const TERMINAL_LINE_STATUSES = new Set(['cancelled', 'returned', 'refunded'])

function generateLineId() {
  return `line_${crypto.randomBytes(8).toString('hex')}`
}

function lineSubtotalFor(item) {
  return round2((Number(item.price) || 0) * (Number(item.quantity) || 1))
}

/**
 * Attach lineId, pricing allocation, and initial status at checkout.
 */
function enrichVerifiedItems(verifiedItems, subtotal, couponDiscount = 0) {
  const orderSubtotal = round2(Number(subtotal) || 0)
  const discount = round2(Number(couponDiscount) || 0)
  return (verifiedItems || []).map((item) => {
    const lineSubtotal = lineSubtotalFor(item)
    const discountAllocated =
      orderSubtotal > 0 ? round2((lineSubtotal / orderSubtotal) * discount) : 0
    const refundableAmount = round2(Math.max(0, lineSubtotal - discountAllocated))
    return {
      ...item,
      lineId: generateLineId(),
      status: 'active',
      lineSubtotal,
      discountAllocated,
      refundableAmount,
    }
  })
}

/**
 * Backfill line fields for legacy orders (read path).
 */
function normalizeOrderItems(items, order = {}) {
  const subtotal =
    order.subtotal != null
      ? round2(Number(order.subtotal))
      : round2((items || []).reduce((s, i) => s + lineSubtotalFor(i), 0))
  const couponDiscount = round2(Number(order.couponDiscount) || 0)

  return (items || []).map((item, index) => {
    const lineSubtotal = item.lineSubtotal != null ? round2(item.lineSubtotal) : lineSubtotalFor(item)
    const discountAllocated =
      item.discountAllocated != null
        ? round2(item.discountAllocated)
        : subtotal > 0
          ? round2((lineSubtotal / subtotal) * couponDiscount)
          : 0
    const refundableAmount =
      item.refundableAmount != null
        ? round2(item.refundableAmount)
        : round2(Math.max(0, lineSubtotal - discountAllocated))

    return {
      ...item,
      lineId:
        String(item.lineId || '').trim() ||
        `line_legacy_${index}_${String(item.productId || 'item').slice(-6)}`,
      status: LINE_STATUSES.includes(item.status) ? item.status : 'active',
      lineSubtotal,
      discountAllocated,
      refundableAmount,
    }
  })
}

function findLineById(items, lineId) {
  const key = String(lineId || '').trim()
  if (!key) return null
  return (items || []).find((i) => String(i.lineId) === key) || null
}

function getActiveLines(items) {
  return (items || []).filter((i) => i.status === 'active')
}

function isLineActive(line) {
  return line && line.status === 'active'
}

function lineStatusLabel(status) {
  return LINE_STATUS_LABELS[status] || status || 'Active'
}

function canCustomerCancelLine(line, orderStatus) {
  return isLineActive(line) && canCustomerCancel(orderStatus)
}

function canCustomerReturnLine(line, orderStatus) {
  return isLineActive(line) && canCustomerReturn(orderStatus)
}

/**
 * Refund for cancelling one line; includes shipping when last active line is cancelled.
 */
function computeLineCancelRefund(order, line, items) {
  const normalized = normalizeOrderItems(items, order)
  const activeAfter = normalized.filter(
    (i) => i.lineId !== line.lineId && i.status === 'active'
  )
  let amount = round2(Number(line.refundableAmount) || 0)
  const shippingFee = round2(Number(order.shippingFee) || 0)
  if (activeAfter.length === 0 && shippingFee > 0) {
    amount = round2(amount + shippingFee)
  }
  return amount
}

function computeLineReturnRefund(line) {
  return round2(Number(line.refundableAmount) || 0)
}

/**
 * Derive order header status after line-level changes.
 */
function deriveOrderStatusFromLines(items, currentStatus) {
  const normalized = items || []
  const active = normalized.filter((i) => i.status === 'active')
  if (active.length === 0) {
    const allCancelled = normalized.every((i) => i.status === 'cancelled')
    const allReturned = normalized.every((i) =>
      ['returned', 'refunded'].includes(i.status)
    )
    if (allCancelled) return 'Cancelled'
    if (allReturned) return 'Returned'
  }
  return normalizeLegacyOrderStatus(currentStatus)
}

function orderSummaryFromLines(items, orderTotal, refunds = []) {
  const totalRefunded = round2(
    (refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  )
  const paid = round2(Number(orderTotal) || 0)
  const active = getActiveLines(items)
  const cancelled = (items || []).filter((i) => i.status === 'cancelled').length
  const returnPending = (items || []).filter((i) =>
    ['return_requested', 'return_received'].includes(i.status)
  ).length
  return {
    activeLineCount: active.length,
    cancelledLineCount: cancelled,
    returnPendingLineCount: returnPending,
    totalRefunded,
    netPaid: round2(Math.max(0, paid - totalRefunded)),
  }
}

function persistNormalizedItems(doc) {
  const items = normalizeOrderItems(doc.items, doc)
  doc.items = items
  doc.markModified('items')
  return items
}

function updateLineInItems(items, lineId, patch) {
  const key = String(lineId || '').trim()
  return items.map((item) => {
    if (String(item.lineId) !== key) return item
    return { ...item, ...patch }
  })
}

function generateLineRmaId(orderPublicId, lineId) {
  const base = String(orderPublicId || 'ORD').replace(/^ORD-/, '')
  const suffix = String(lineId || '').replace(/^line_/, '').slice(0, 8)
  return `RMA-${base}-${suffix}`
}

function refundsForLine(refunds, lineId) {
  const key = String(lineId || '')
  return (refunds || []).filter((r) =>
    (r.lineItemIds || []).some((id) => String(id) === key)
  )
}

function sumRefundAmount(refundRows) {
  return round2((refundRows || []).reduce((s, r) => s + Number(r.amount || 0), 0))
}

/**
 * Human-readable refund state per line (admin + customer UI).
 * Avoids showing "Refundable" on lines already refunded or not eligible.
 */
function getLineRefundDisplay(line, order) {
  const lineId = String(line.lineId || '')
  const status = line.status || 'active'
  const cap = round2(Number(line.refundableAmount) || 0)
  const linked = refundsForLine(order.refunds, lineId)
  const refundedTotal = sumRefundAmount(linked)
  const orderStatus = normalizeLegacyOrderStatus(order.status)
  const items = order.items || []

  if (status === 'refunded') {
    const amt = refundedTotal > 0 ? refundedTotal : cap
    return { state: 'refunded', amount: amt, label: `Refunded · ₹${amt}` }
  }

  if (status === 'cancelled') {
    if (refundedTotal > 0) {
      return {
        state: 'refunded',
        amount: refundedTotal,
        label: `Cancelled · refunded ₹${refundedTotal}`,
      }
    }
    return { state: 'cancelled', amount: 0, label: 'Cancelled · no refund' }
  }

  if (['return_requested', 'return_received', 'returned'].includes(status)) {
    return {
      state: 'pending',
      amount: cap,
      label: `Return in progress · up to ₹${cap}`,
    }
  }

  if (status === 'active') {
    if (canCustomerCancel(orderStatus)) {
      const amt = computeLineCancelRefund(order, line, items)
      return { state: 'eligible_cancel', amount: amt, label: `If cancelled · up to ₹${amt}` }
    }
    // Delivered & still active: no refund label until customer initiates return
    return null
  }

  return null
}

function enrichItemsWithRefundDisplay(items, order) {
  const orderCtx = { ...order, items }
  return (items || []).map((line) => ({
    ...line,
    refundDisplay: getLineRefundDisplay(line, orderCtx),
  }))
}

module.exports = {
  LINE_STATUSES,
  LINE_STATUS_LABELS,
  TERMINAL_LINE_STATUSES,
  generateLineId,
  enrichVerifiedItems,
  normalizeOrderItems,
  findLineById,
  getActiveLines,
  isLineActive,
  lineStatusLabel,
  canCustomerCancelLine,
  canCustomerReturnLine,
  computeLineCancelRefund,
  computeLineReturnRefund,
  deriveOrderStatusFromLines,
  orderSummaryFromLines,
  persistNormalizedItems,
  updateLineInItems,
  generateLineRmaId,
  lineSubtotalFor,
  getLineRefundDisplay,
  enrichItemsWithRefundDisplay,
  refundsForLine,
}
