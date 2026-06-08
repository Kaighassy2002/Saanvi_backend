const StockMovement = require('../../Models/StockMovement')
const { sendAdminLowStockEmail } = require('./otpEmail')

const COMMIT_STATUSES = new Set(['Packed', 'Shipped', 'Out For Delivery', 'Delivered'])
const PRE_COMMIT_STATUSES = new Set(['Placed', 'Confirmed', 'Pending', 'Paid', 'Processing'])

function isCommitStatus(status) {
  return COMMIT_STATUSES.has(String(status || ''))
}

function isPreCommitStatus(status) {
  const s = String(status || '')
  return PRE_COMMIT_STATUSES.has(s) || s === 'Placed' || s === 'Confirmed'
}

function availableUnits(stock, reserved) {
  return Math.max(0, (Number(stock) || 0) - (Number(reserved) || 0))
}

async function recordStockMovement({
  productId,
  variantName = '',
  delta,
  movementType,
  reason = '',
  adminId = '',
  adminEmail = '',
  orderId = '',
  stockAfter = 0,
  reservedAfter = 0,
}) {
  await StockMovement.create({
    productId: String(productId),
    variantName: String(variantName || ''),
    delta: Number(delta) || 0,
    movementType: String(movementType || 'adjust'),
    reason: String(reason || movementType || 'adjust'),
    adminId,
    adminEmail,
    orderId: String(orderId || ''),
    stockAfter: Number(stockAfter) || 0,
    reservedAfter: Number(reservedAfter) || 0,
  })
}

async function wasReorderAlertSentRecently(productId, variantName = '') {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const hit = await StockMovement.findOne({
    productId: String(productId),
    variantName: String(variantName || ''),
    movementType: 'reorder_alert',
    createdAt: { $gte: since },
  })
    .select('_id')
    .lean()
  return !!hit
}

async function maybeSendReorderAlert(productDoc, variantName = '') {
  if (!productDoc) return
  const threshold =
    productDoc.lowStockThreshold != null ? Number(productDoc.lowStockThreshold) : 5
  const vName = String(variantName || '').trim()
  let stock = Number(productDoc.stock) || 0
  let reserved = Number(productDoc.reservedStock) || 0
  let name = productDoc.name || 'Product'
  let sku = productDoc.sku || ''

  if (vName) {
    const v = (productDoc.variants || []).find((x) => String(x.name) === vName)
    if (!v) return
    stock = Number(v.stock) || 0
    reserved = Number(v.reservedStock) || 0
    sku = v.sku || sku
  }

  const available = availableUnits(stock, reserved)
  if (available > threshold) return

  const productId = String(productDoc._id || productDoc.id)
  if (await wasReorderAlertSentRecently(productId, vName)) return

  const sent = await sendAdminLowStockEmail({
    productName: name,
    sku,
    variantName: vName,
    available,
    threshold,
    onHand: stock,
    reserved,
  })

  if (sent) {
    await recordStockMovement({
      productId,
      variantName: vName,
      delta: 0,
      movementType: 'reorder_alert',
      reason: `Reorder alert: ${available} available (threshold ${threshold})`,
      stockAfter: stock,
      reservedAfter: reserved,
    })
  }
}

module.exports = {
  COMMIT_STATUSES,
  PRE_COMMIT_STATUSES,
  isCommitStatus,
  isPreCommitStatus,
  availableUnits,
  recordStockMovement,
  maybeSendReorderAlert,
}
