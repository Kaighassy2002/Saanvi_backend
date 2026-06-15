const mongoose = require('mongoose')
const Product = require('../Models/Product')
const toClientProduct = Product.toClientProduct
const StockMovement = require('../Models/StockMovement')
const { isValidObjectId } = require('./helpers/mongoIds')
const { recordStockMovement, maybeSendReorderAlert } = require('./helpers/stockInventory')
const {
  sanitizeProductVariants,
  persistSanitizedVariants,
} = require('./helpers/productVariantSanitize')

function productObjectId(productId) {
  return new mongoose.Types.ObjectId(String(productId))
}

async function adminAdjustStock(req, res) {
  const { productId, variantName, delta, reason } = req.body || {}
  if (!isValidObjectId(productId)) {
    return res.status(400).json({ message: 'Valid productId required' })
  }
  const change = Number(delta)
  if (!Number.isFinite(change) || change === 0) {
    return res.status(400).json({ message: 'delta must be a non-zero number' })
  }

  const raw = await Product.findById(productId).lean()
  if (!raw) return res.status(404).json({ message: 'Product not found' })

  const vName = String(variantName || '').trim()
  const variants = await persistSanitizedVariants(Product, productId, raw.variants)
  const product = sanitizeProductVariants({ ...raw, variants })

  let stockAfter = 0
  let reservedAfter = 0

  if (vName) {
    const idx = variants.findIndex((v) => String(v.name) === vName)
    if (idx < 0) return res.status(404).json({ message: 'Variant not found' })
    stockAfter = Math.max(0, (Number(variants[idx].stock) || 0) + change)
    reservedAfter = Number(variants[idx].reservedStock) || 0
    await Product.collection.updateOne(
      { _id: productObjectId(productId), 'variants.name': vName },
      { $set: { 'variants.$[elem].stock': stockAfter } },
      { arrayFilters: [{ 'elem.name': vName }] }
    )
  } else {
    stockAfter = Math.max(0, (Number(product.stock) || 0) + change)
    reservedAfter = Number(product.reservedStock) || 0
    await Product.collection.updateOne(
      { _id: productObjectId(productId) },
      { $set: { stock: stockAfter } }
    )
  }

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

  const fresh = sanitizeProductVariants(
    await Product.findById(productId).lean()
  )
  await maybeSendReorderAlert(fresh, vName)

  res.json(toClientProduct(fresh))
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

    const raw = await Product.findById(productId).lean()
    if (!raw) {
      results.push({ productId, variantName: vName, ok: false, message: 'Product not found' })
      continue
    }

    const variants = await persistSanitizedVariants(Product, productId, raw.variants)
    const product = sanitizeProductVariants({ ...raw, variants })

    let before = 0
    let reservedAfter = 0

    if (vName) {
      const idx = variants.findIndex((v) => String(v.name) === vName)
      if (idx < 0) {
        results.push({ productId, variantName: vName, ok: false, message: 'Variant not found' })
        continue
      }
      before = Number(variants[idx].stock) || 0
      reservedAfter = Number(variants[idx].reservedStock) || 0
      await Product.collection.updateOne(
        { _id: productObjectId(productId), 'variants.name': vName },
        { $set: { 'variants.$[elem].stock': counted } },
        { arrayFilters: [{ 'elem.name': vName }] }
      )
    } else {
      before = Number(product.stock) || 0
      reservedAfter = Number(product.reservedStock) || 0
      await Product.collection.updateOne(
        { _id: productObjectId(productId) },
        { $set: { stock: counted } }
      )
    }

    const delta = counted - before

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
      const fresh = sanitizeProductVariants(await Product.findById(productId).lean())
      await maybeSendReorderAlert(fresh, vName)
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
