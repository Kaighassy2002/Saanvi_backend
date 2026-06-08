const Product = require('../Models/Product')
const { availableUnits } = require('./helpers/stockInventory')

function defaultThreshold(plain) {
  return plain.lowStockThreshold != null ? Number(plain.lowStockThreshold) : 5
}

function skuRowsFromProduct(plain) {
  const threshold = defaultThreshold(plain)
  const productId = String(plain._id)
  const name = plain.name || ''
  const category = plain.category || ''
  const published = plain.published !== false
  const rows = []
  const variants = Array.isArray(plain.variants) ? plain.variants : []

  if (variants.length === 0) {
    const onHand = Number(plain.stock) || 0
    const reserved = Number(plain.reservedStock) || 0
    rows.push({
      type: 'product',
      productId,
      name,
      sku: plain.sku || '',
      category,
      published,
      onHand,
      reserved,
      available: availableUnits(onHand, reserved),
      threshold,
      variantName: null,
    })
    return rows
  }

  for (const v of variants) {
    const onHand = Number(v.stock) || 0
    const reserved = Number(v.reservedStock) || 0
    rows.push({
      type: 'variant',
      productId,
      name,
      sku: v.sku || plain.sku || '',
      category,
      published,
      onHand,
      reserved,
      available: availableUnits(onHand, reserved),
      threshold,
      variantName: v.name || '',
    })
  }
  return rows
}

function sortSkuRows(items, sortKey) {
  const key = String(sortKey || 'category').toLowerCase()
  const sorted = [...items]
  if (key === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name) || (a.variantName || '').localeCompare(b.variantName || ''))
  } else if (key === 'available') {
    sorted.sort((a, b) => a.available - b.available)
  } else if (key === 'onhand' || key === 'on_hand') {
    sorted.sort((a, b) => a.onHand - b.onHand)
  } else {
    sorted.sort(
      (a, b) =>
        (a.category || '').localeCompare(b.category || '') ||
        a.name.localeCompare(b.name) ||
        (a.variantName || '').localeCompare(b.variantName || '')
    )
  }
  return sorted
}

async function adminAllStock(req, res) {
  const category = String(req.query.category || '').trim()
  const q = String(req.query.q || '').trim().toLowerCase()
  const sort = String(req.query.sort || 'category')
  const filter = category ? { category } : {}
  const docs = await Product.find(filter).lean()

  const categories = new Set()
  let items = []

  for (const plain of docs) {
    if (plain.category) categories.add(plain.category)
    const rows = skuRowsFromProduct(plain)
    for (const row of rows) {
      if (q) {
        const hay = `${row.name} ${row.sku} ${row.category} ${row.variantName || ''}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      items.push(row)
    }
  }

  items = sortSkuRows(items, sort)
  res.json({
    items,
    total: items.length,
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
  })
}

async function adminLowStock(_req, res) {
  const docs = await Product.find().lean()
  const items = []

  for (const plain of docs) {
    for (const row of skuRowsFromProduct(plain)) {
      if (row.available <= row.threshold) {
        items.push({
          type: row.type,
          productId: row.productId,
          name: row.name,
          sku: row.sku,
          category: row.category,
          stock: row.available,
          onHand: row.onHand,
          reserved: row.reserved,
          available: row.available,
          threshold: row.threshold,
          variantName: row.variantName,
        })
      }
    }
  }

  items.sort((a, b) => a.available - b.available)
  res.json({ items, total: items.length })
}

module.exports = { adminAllStock, adminLowStock }
