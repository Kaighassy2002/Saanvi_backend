const PDFDocument = require('pdfkit')
const { buildGstInvoiceData } = require('./orderGst')

function formatInr(n) {
  return `INR ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Generate GST tax invoice PDF buffer.
 * @param {object} order — mongoose doc or plain object with publicId
 * @param {object} store — { storeName, storeLocation, storeGstin, supportEmail, supportPhone, defaultGstPercent, defaultHsnCode, storeState }
 */
function generateGstInvoicePdf(order, store = {}) {
  return new Promise((resolve, reject) => {
    const gst = buildGstInvoiceData(order, store)
    const shipping = order.shipping || {}
    const customerName =
      [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') ||
      order.customerName ||
      'Customer'

    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const storeName = String(store.storeName || 'Aashmika Designs').trim()
    const gstin = String(store.storeGstin || '').trim()

    doc.fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(11).font('Helvetica-Bold').text(storeName)
    doc.font('Helvetica').fontSize(9)
    if (store.storeLocation) doc.text(store.storeLocation)
    if (gstin) doc.text(`GSTIN: ${gstin}`)
    if (store.supportEmail) doc.text(`Email: ${store.supportEmail}`)
    if (store.supportPhone) doc.text(`Phone: ${store.supportPhone}`)

    doc.moveDown()
    doc.font('Helvetica-Bold').fontSize(10).text('Invoice details', { underline: true })
    doc.font('Helvetica').fontSize(9)
    doc.text(`Invoice No: ${gst.invoiceNo}`)
    doc.text(`Order ID: ${gst.orderId}`)
    doc.text(`Invoice Date: ${formatDate(gst.date)}`)
    doc.text(`Place of supply: ${gst.shipState || '—'}${gst.interstate ? ' (Inter-state)' : ' (Intra-state)'}`)

    doc.moveDown()
    doc.font('Helvetica-Bold').text('Bill to')
    doc.font('Helvetica')
    doc.text(customerName)
    if (order.customerEmail) doc.text(order.customerEmail)
    const addr = [
      shipping.address || shipping.line1,
      shipping.city,
      shipping.state,
      shipping.pincode || shipping.zip,
    ]
      .filter(Boolean)
      .join(', ')
    if (addr) doc.text(addr)
    if (shipping.phone) doc.text(`Phone: ${shipping.phone}`)

    doc.moveDown()
    const tableTop = doc.y
    const col = { item: 48, hsn: 220, qty: 280, rate: 320, taxable: 380, gst: 450, amount: 510 }

    doc.font('Helvetica-Bold').fontSize(8)
    doc.text('Item', col.item, tableTop)
    doc.text('HSN', col.hsn, tableTop)
    doc.text('Qty', col.qty, tableTop)
    doc.text('Rate', col.rate, tableTop)
    doc.text('Taxable', col.taxable, tableTop)
    doc.text(`GST ${gst.gstPercent}%`, col.gst, tableTop)
    doc.text('Amount', col.amount, tableTop)
    doc.moveTo(48, tableTop + 12).lineTo(545, tableTop + 12).stroke()

    let y = tableTop + 18
    doc.font('Helvetica').fontSize(8)
    for (const line of gst.lines) {
      const label = line.variantName ? `${line.name} (${line.variantName})` : line.name
      doc.text(label.slice(0, 42), col.item, y, { width: 165 })
      doc.text(line.hsn, col.hsn, y)
      doc.text(String(line.qty), col.qty, y)
      doc.text(formatInr(line.unitPrice), col.rate, y, { width: 50 })
      doc.text(formatInr(line.taxable), col.taxable, y, { width: 60 })
      doc.text(formatInr(line.gstAmount), col.gst, y, { width: 50 })
      doc.text(formatInr(line.gross), col.amount, y, { width: 60 })
      y += 28
      if (y > 680) {
        doc.addPage()
        y = 48
      }
    }

    doc.moveDown(2)
    y = Math.max(doc.y, y + 8)
    doc.font('Helvetica').fontSize(9)
    const summaryX = 340
    doc.text(`Taxable value: ${formatInr(gst.taxableValue)}`, summaryX, y)
    y += 14
    if (gst.interstate) {
      doc.text(`IGST (${gst.gstPercent}%): ${formatInr(gst.igst)}`, summaryX, y)
      y += 14
    } else {
      const half = gst.gstPercent / 2
      doc.text(`CGST (${half}%): ${formatInr(gst.cgst)}`, summaryX, y)
      y += 14
      doc.text(`SGST (${half}%): ${formatInr(gst.sgst)}`, summaryX, y)
      y += 14
    }
    if (gst.shippingFee > 0) {
      doc.text(`Shipping: ${formatInr(gst.shippingFee)}`, summaryX, y)
      y += 14
    }
    doc.font('Helvetica-Bold')
    doc.text(`Grand total: ${formatInr(gst.orderTotal)}`, summaryX, y)
    doc.font('Helvetica').fontSize(8)
    doc.moveDown(2)
    doc.text(
      'This is a computer-generated tax invoice. Prices are inclusive of GST unless stated otherwise.',
      48,
      doc.y,
      { width: 500, align: 'center' }
    )

    doc.end()
  })
}

module.exports = { generateGstInvoicePdf, buildGstInvoiceData }
