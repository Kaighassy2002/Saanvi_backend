const Product = require('../Models/Product')
const StockMovement = require('../Models/StockMovement')
const { isValidObjectId } = require('./helpers/mongoIds')

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
  const vName = String(variantName || '').trim()

  if (vName) {
    const variants = Array.isArray(doc.variants) ? doc.variants.map((v) => v.toObject?.() || { ...v }) : []
    const idx = variants.findIndex((v) => String(v.name) === vName)
    if (idx < 0) return res.status(404).json({ message: 'Variant not found' })
    variants[idx].stock = Math.max(0, (Number(variants[idx].stock) || 0) + change)
    stockAfter = variants[idx].stock
    doc.variants = variants
  } else {
    doc.stock = Math.max(0, (Number(doc.stock) || 0) + change)
    stockAfter = doc.stock
  }

  await doc.save()
  await StockMovement.create({
    productId: String(productId),
    variantName: vName,
    delta: change,
    reason: String(reason || 'manual adjustment'),
    adminId: String(req.admin?.sub || req.admin?.id || ''),
    adminEmail: String(req.admin?.email || ''),
    stockAfter,
  })

  res.json(doc.toJSON())
}

async function adminStockMovements(req, res) {
  const productId = String(req.query.productId || '')
  const filter = productId ? { productId } : {}
  const docs = await StockMovement.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  res.json({ movements: docs })
}

module.exports = { adminAdjustStock, adminStockMovements }
