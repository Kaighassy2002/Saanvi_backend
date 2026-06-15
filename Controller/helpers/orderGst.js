/**
 * GST breakdown for Indian tax invoices (inclusive pricing).
 * Uses store default GST % and HSN; line items may override hsnCode.
 */

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

function lineAmount(item) {
  const qty = Number(item.quantity || item.qty || 1)
  if (item.lineTotal != null) return Number(item.lineTotal)
  return (Number(item.price) || 0) * qty
}

function isInterState(storeState, shipState) {
  const a = String(storeState || '').trim().toLowerCase()
  const b = String(shipState || '').trim().toLowerCase()
  if (!a || !b) return false
  return a !== b
}

function splitGst(gstAmount, interstate) {
  const total = round2(gstAmount)
  if (interstate) {
    return { cgst: 0, sgst: 0, igst: total }
  }
  const half = round2(total / 2)
  return { cgst: half, sgst: round2(total - half), igst: 0 }
}

/**
 * @param {object} order
 * @param {{ defaultGstPercent?: number, defaultHsnCode?: string, storeState?: string }} settings
 */
function buildGstInvoiceData(order, settings = {}) {
  const gstPercent = Number(settings.defaultGstPercent) || 3
  const defaultHsn = String(settings.defaultHsnCode || '7113')
  const storeState = String(settings.storeState || settings.storeLocation || '').trim()
  const shipState = String(order.shipping?.state || '').trim()
  const interstate = isInterState(storeState, shipState)
  const gstRate = gstPercent / 100

  const items = Array.isArray(order.items) ? order.items : []
  const lines = items.map((item, i) => {
    const qty = Number(item.quantity || item.qty || 1)
    const gross = round2(lineAmount(item))
    const taxable = round2(gross / (1 + gstRate))
    const gstAmount = round2(gross - taxable)
    const taxSplit = splitGst(gstAmount, interstate)
    return {
      index: i + 1,
      name: String(item.name || item.title || 'Item'),
      variantName: String(item.variantName || ''),
      hsn: String(item.hsnCode || defaultHsn),
      qty,
      unitPrice: qty > 0 ? round2(gross / qty) : gross,
      gross,
      taxable,
      gstPercent,
      gstAmount,
      ...taxSplit,
    }
  })

  const subtotalGross = round2(lines.reduce((s, l) => s + l.gross, 0))
  const shippingFee = round2(Number(order.shippingFee) || 0)
  const couponDiscount = round2(Number(order.couponDiscount) || 0)
  const couponCode = String(order.couponCode || '').trim()
  const orderTotal = round2(Number(order.total) || Math.max(0, subtotalGross - couponDiscount) + shippingFee)

  const itemsTaxable = round2(lines.reduce((s, l) => s + l.taxable, 0))
  const itemsGst = round2(lines.reduce((s, l) => s + l.gstAmount, 0))
  const cgst = round2(lines.reduce((s, l) => s + l.cgst, 0))
  const sgst = round2(lines.reduce((s, l) => s + l.sgst, 0))
  const igst = round2(lines.reduce((s, l) => s + l.igst, 0))

  const invoiceNo =
    order.invoiceNumber ||
    (String(order.publicId || order.id || '').startsWith('ORD-')
      ? String(order.publicId || order.id).replace('ORD-', 'INV-')
      : `INV-${order.publicId || order.id || 'DRAFT'}`)

  return {
    invoiceNo,
    orderId: order.publicId || order.id,
    date: order.placedAt || order.date,
    gstPercent,
    defaultHsn,
    interstate,
    storeState,
    shipState,
    lines,
    subtotalGross,
    shippingFee,
    couponDiscount,
    couponCode,
    orderTotal,
    itemsTaxable,
    itemsGst,
    cgst,
    sgst,
    igst,
    taxableValue: itemsTaxable,
    totalGst: itemsGst,
  }
}

module.exports = {
  buildGstInvoiceData,
  round2,
  isInterState,
}
