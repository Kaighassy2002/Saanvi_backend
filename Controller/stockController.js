const Product = require('../Models/Product')
const StockMovement = require('../Models/StockMovement')
const { isValidObjectId } = require('./helpers/mongoIds')
const { recordStockMovement, maybeSendReorderAlert } = require('./helpers/stockInventory')

async function adminAdjustStock(req, res) {
  const { productId, variantName, delta, reason } = req.body || {}
  if (!isValidObjectId(productId)) {
    return res.status(400).json({ message: 'Valid productId required' })
  }
  const change = Number(delta)
  if (!Number.isFinite(change) || change === 0) {
    return res.status(400).json({ message: 'delta must be a non-zero number' })
  }

  const doc = await Product.findById(productId)
  if (!doc) return res.status(404).json({ message: 'Product not found' })

  let stockAfter = 0
  let reservedAfter = 0
  const vName = String(variantName || '').trim()

  if (vName) {
    const variants = Array.isArray(doc.variants) ? doc.variants.map((v) => v.toObject?.() || { ...v }) : []
    const idx = variants.findIndex((v) => String(v.name) === vName)
    if (idx < 0) return res.status(404).json({ message: 'Variant not found' })
    variants[idx].stock = Math.max(0, (Number(variants[idx].stock) || 0) + change)
    stockAfter = variants[idx].stock
    reservedAfter = Number(variants[idx].reservedStock) || 0
    doc.variants = variants
  } else {
    doc.stock = Math.max(0, (Number(doc.stock) || 0) + change)
    stockAfter = doc.stock
    reservedAfter = Number(doc.reservedStock) || 0
  }

  await doc.save()
  await recordStockMovement({
    productId: String(productId),
    variantName: vName,
    delta: change,
    movementType: 'adjust',
    reason: String(reason || 'manual adjustment'),
    adminId: String(req.admin?.sub || req.admin?.id || ''),
    adminEmail: String(req.admin?.email || ''),
    stockAfter,
    reservedAfter,
  })
  await maybeSendReorderAlert(doc, vName)

  res.json(doc.toJSON())
}

async function adminStockMovements(req, res) {
  const productId = String(req.query.productId || '').trim()
  const movementType = String(req.query.movementType || '').trim()
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
  const filter = {}
  if (productId) filter.productId = productId
  if (movementType) filter.movementType = movementType

  const docs = await StockMovement.find(filter).sort({ createdAt: -1 }).limit(limit).lean()
  const productIds = [...new Set(docs.map((m) => m.productId).filter(Boolean))]
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select('name sku')
        .lean()
    : []
  const productMap = Object.fromEntries(
    products.map((p) => [String(p._id), { name: p.name || '', sku: p.sku || '' }])
  )

  const movements = docs.map((m) => ({
    ...m,
    id: String(m._id),
    productName: productMap[m.productId]?.name || '',
    productSku: productMap[m.productId]?.sku || '',
  }))

  res.json({ movements, total: movements.length })
}

async function adminStockTake(req, res) {
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
  const note = String(req.body?.note || 'Physical stock count').trim()
  if (lines.length === 0) {
    return res.status(400).json({ message: 'lines array required' })
  }

  const results = []
  const adminId = String(req.admin?.sub || req.admin?.id || '')
  const adminEmail = String(req.admin?.email || '')

  for (const line of lines) {
    const productId = String(line?.productId || '')
    const counted = Number(line?.counted)
    const vName = String(line?.variantName || '').trim()

    if (!isValidObjectId(productId) || !Number.isFinite(counted) || counted < 0) {
      results.push({ productId, variantName: vName, ok: false, message: 'Invalid line' })
      continue
    }

    const doc = await Product.findById(productId)
    if (!doc) {
      results.push({ productId, variantName: vName, ok: false, message: 'Product not found' })
      continue
    }

    let before = 0
    let reservedAfter = 0

    if (vName) {
      const variants = Array.isArray(doc.variants) ? doc.variants.map((v) => v.toObject?.() || { ...v }) : []
      const idx = variants.findIndex((v) => String(v.name) === vName)
      if (idx < 0) {
        results.push({ productId, variantName: vName, ok: false, message: 'Variant not found' })
        continue
      }
      before = Number(variants[idx].stock) || 0
      reservedAfter = Number(variants[idx].reservedStock) || 0
      variants[idx].stock = counted
      doc.variants = variants
    } else {
      before = Number(doc.stock) || 0
      reservedAfter = Number(doc.reservedStock) || 0
      doc.stock = counted
    }

    const delta = counted - before
    await doc.save()

    if (delta !== 0) {
      await recordStockMovement({
        productId,
        variantName: vName,
        delta,
        movementType: 'stock_take',
        reason: note,
        adminId,
        adminEmail,
        stockAfter: counted,
        reservedAfter,
      })
      await maybeSendReorderAlert(doc, vName)
    }

    results.push({
      productId,
      variantName: vName,
      ok: true,
      before,
      counted,
      delta,
      stockAfter: counted,
      reservedAfter,
    })
  }

  res.json({ results, adjusted: results.filter((r) => r.ok && r.delta !== 0).length })
}

module.exports = { adminAdjustStock, adminStockMovements, adminStockTake }
