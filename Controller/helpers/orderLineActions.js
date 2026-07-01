const Product = require('../../Models/Product')
const { restockOrderItems } = require('./orderLineStock')
const {
  appendHistoryEntry,
  canCustomerCancel,
  canCustomerReturn,
} = require('./orderWorkflow')
const {
  processRazorpayRefund,
  resolveRefundPaymentStatus,
  applyRefundToPayment,
  round2,
} = require('./orderRefund')
const { listPaymentsForOrderPublicId } = require('./orderPayments')
const { isCodPayment } = require('./orderWorkflow')
const {
  normalizeOrderItems,
  findLineById,
  computeLineCancelRefund,
  computeLineReturnRefund,
  deriveOrderStatusFromLines,
  updateLineInItems,
  generateLineRmaId,
  persistNormalizedItems,
} = require('./orderLineItems')

async function processLineRefund(order, amount, { reason, note, by, lineItemIds, type, skipGateway }) {
  const orderTotal = round2(Number(order.total) || 0)
  const priorRefunded = (order.refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const maxRefundable = round2(orderTotal - priorRefunded)
  const refundAmount = round2(Number(amount) || 0)

  if (refundAmount <= 0) {
    return { refundRecord: null, nextPaymentStatus: order.paymentStatus, refundAmount: 0 }
  }
  if (refundAmount > maxRefundable + 0.01) {
    throw new Error(`Refund amount cannot exceed ${maxRefundable}`)
  }

  const payments = await listPaymentsForOrderPublicId(order.publicId)
  const razorpayPayment = payments.find((p) => p.provider === 'razorpay' && p.razorpayPaymentId)
  const paymentStatus = String(order.paymentStatus || '').toLowerCase()
  const shouldRefund =
    !skipGateway &&
    razorpayPayment &&
    (paymentStatus === 'paid' || paymentStatus === 'partially_refunded')

  let refundRecord
  if (shouldRefund) {
    refundRecord = await processRazorpayRefund({
      order,
      payment: razorpayPayment,
      amountInr: refundAmount,
      reason,
      note,
      by,
    })
  } else if (!isCodPayment(order.paymentMethod)) {
    refundRecord = {
      amount: refundAmount,
      currency: 'INR',
      reason: String(reason || '').trim(),
      note: String(note || '').trim(),
      razorpayRefundId: '',
      status: 'manual',
      provider: 'manual',
      by: String(by || 'admin'),
      at: new Date(),
      lineItemIds: lineItemIds || [],
      type: type || 'cancellation',
    }
  } else {
    refundRecord = null
  }

  if (!refundRecord) {
    return { refundRecord: null, nextPaymentStatus: order.paymentStatus, refundAmount: 0 }
  }

  refundRecord.lineItemIds = lineItemIds || []
  refundRecord.type = type || 'cancellation'
  const nextPaymentStatus = resolveRefundPaymentStatus(orderTotal, order.refunds, refundAmount)
  order.refunds = [...(order.refunds || []), refundRecord]
  order.paymentStatus = nextPaymentStatus
  await applyRefundToPayment(order.publicId, nextPaymentStatus)
  return { refundRecord, nextPaymentStatus, refundAmount }
}

/**
 * Cancel a single line (pre-dispatch). Restocks inventory and refunds if prepaid.
 */
async function cancelOrderLine(orderDoc, lineId, { note = '', by = 'customer', skipGateway = false } = {}) {
  const items = persistNormalizedItems(orderDoc)
  const line = findLineById(items, lineId)
  if (!line) {
    throw new Error('Line item not found')
  }
  if (line.status !== 'active') {
    throw new Error('This item cannot be cancelled')
  }
  if (!canCustomerCancel(orderDoc.status)) {
    throw new Error('Cancellation is only available before your order is shipped')
  }

  const refundAmount = computeLineCancelRefund(orderDoc, line, items)
  const lineName = String(line.name || 'item').trim()
  const historyNote =
    note.trim() ||
    `Item cancelled: ${lineName}${refundAmount > 0 ? ` — refund INR ${refundAmount}` : ''}`

  const updatedItems = updateLineInItems(items, lineId, {
    status: 'cancelled',
    cancelledAt: new Date(),
    cancelReason: note.trim(),
  })
  orderDoc.items = updatedItems
  orderDoc.markModified('items')

  await restockOrderItems(Product, [line], null, orderDoc.publicId, orderDoc.stockCommitted)

  const { nextPaymentStatus } = await processLineRefund(orderDoc, refundAmount, {
    reason: note.trim() || 'Line item cancellation',
    note: historyNote,
    by,
    lineItemIds: [lineId],
    type: 'cancellation',
    skipGateway,
  })

  const nextOrderStatus = deriveOrderStatusFromLines(updatedItems, orderDoc.status)
  orderDoc.status = nextOrderStatus
  orderDoc.statusHistory = appendHistoryEntry(orderDoc.statusHistory, {
    status: nextOrderStatus,
    paymentStatus: nextPaymentStatus || orderDoc.paymentStatus,
    note: historyNote,
    by,
  })

  await orderDoc.save()

  return {
    order: orderDoc,
    lineId,
    refundAmount,
    lineName,
  }
}

/**
 * Customer requests return for a single delivered line.
 */
async function requestReturnOrderLine(orderDoc, lineId, { note = '', by = 'customer' } = {}) {
  const items = persistNormalizedItems(orderDoc)
  const line = findLineById(items, lineId)
  if (!line) {
    throw new Error('Line item not found')
  }
  if (line.status !== 'active') {
    throw new Error('This item cannot be returned')
  }
  if (!canCustomerReturn(orderDoc.status)) {
    throw new Error('Returns are only available for delivered orders')
  }

  const lineName = String(line.name || 'item').trim()
  const rmaId = line.rmaId || generateLineRmaId(orderDoc.publicId, lineId)
  const historyNote = note.trim() || `Return requested: ${lineName}`

  orderDoc.items = updateLineInItems(items, lineId, {
    status: 'return_requested',
    returnRequestedAt: new Date(),
    returnReason: note.trim(),
    rmaId,
  })
  orderDoc.markModified('items')
  orderDoc.statusHistory = appendHistoryEntry(orderDoc.statusHistory, {
    status: orderDoc.status,
    paymentStatus: orderDoc.paymentStatus,
    note: historyNote,
    by,
  })
  await orderDoc.save()

  return { order: orderDoc, lineId, rmaId, lineName }
}

/**
 * Admin: receive return, restock, and refund a single line.
 */
async function adminCompleteLineReturn(orderDoc, lineId, { step, note = '', by = 'admin', skipGateway = false } = {}) {
  const items = persistNormalizedItems(orderDoc)
  const line = findLineById(items, lineId)
  if (!line) {
    throw new Error('Line item not found')
  }

  const stepKey = String(step || '').toLowerCase()
  const lineName = String(line.name || 'item').trim()

  if (stepKey === 'receive') {
    if (line.status !== 'return_requested') {
      throw new Error('Line is not awaiting return receipt')
    }
    orderDoc.items = updateLineInItems(items, lineId, {
      status: 'return_received',
      returnReceivedAt: new Date(),
    })
    orderDoc.markModified('items')
    orderDoc.statusHistory = appendHistoryEntry(orderDoc.statusHistory, {
      status: orderDoc.status,
      paymentStatus: orderDoc.paymentStatus,
      note: note.trim() || `Return received: ${lineName}`,
      by,
    })
    await orderDoc.save()
    return { order: orderDoc, lineId }
  }

  if (stepKey === 'restock') {
    if (!['return_requested', 'return_received'].includes(line.status)) {
      throw new Error('Line is not in return workflow')
    }
    await restockOrderItems(Product, [line], null, orderDoc.publicId, orderDoc.stockCommitted)
    orderDoc.items = updateLineInItems(items, lineId, {
      status: 'returned',
      returnRestockedAt: new Date(),
      ...(line.status === 'return_requested' ? { returnReceivedAt: new Date() } : {}),
    })
    orderDoc.markModified('items')
    orderDoc.statusHistory = appendHistoryEntry(orderDoc.statusHistory, {
      status: orderDoc.status,
      paymentStatus: orderDoc.paymentStatus,
      note: note.trim() || `Return restocked: ${lineName}`,
      by,
    })
    await orderDoc.save()
    return { order: orderDoc, lineId }
  }

  if (stepKey === 'refund') {
    if (!['return_requested', 'return_received', 'returned'].includes(line.status)) {
      throw new Error('Line is not eligible for refund')
    }
    const refundAmount = computeLineReturnRefund(line)

    const { nextPaymentStatus } = await processLineRefund(orderDoc, refundAmount, {
      reason: note.trim() || 'Line item return',
      note: note.trim() || `Refund for return: ${lineName}`,
      by,
      lineItemIds: [lineId],
      type: 'return',
      skipGateway,
    })

    orderDoc.items = updateLineInItems(orderDoc.items, lineId, {
      status: 'refunded',
      refundedAt: new Date(),
    })
    orderDoc.markModified('items')

    const nextOrderStatus = deriveOrderStatusFromLines(orderDoc.items, orderDoc.status)
    if (nextOrderStatus !== orderDoc.status) {
      orderDoc.status = nextOrderStatus
    }
    orderDoc.statusHistory = appendHistoryEntry(orderDoc.statusHistory, {
      status: orderDoc.status,
      paymentStatus: nextPaymentStatus || orderDoc.paymentStatus,
      note: note.trim() || `Refunded INR ${refundAmount} for ${lineName}`,
      by,
    })
    await orderDoc.save()
    return { order: orderDoc, lineId, refundAmount }
  }

  throw new Error('step must be receive, restock, or refund')
}

module.exports = {
  cancelOrderLine,
  requestReturnOrderLine,
  adminCompleteLineReturn,
  processLineRefund,
}
