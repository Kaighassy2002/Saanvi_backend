const Product = require('../Models/Product')

async function adminLowStock(_req, res) {
  const docs = await Product.find().lean()
  const items = []

  for (const plain of docs) {
    const threshold = plain.lowStockThreshold != null ? Number(plain.lowStockThreshold) : 5
    const productStock = Number(plain.stock) || 0
    if (productStock <= threshold) {
      items.push({
        type: 'product',
        productId: String(plain._id),
        name: plain.name || '',
        sku: plain.sku || '',
        category: plain.category || '',
        stock: productStock,
        threshold,
        variantName: null,
      })
    }
    const variants = Array.isArray(plain.variants) ? plain.variants : []
    for (const v of variants) {
      const vStock = Number(v.stock) || 0
      if (vStock <= threshold) {
        items.push({
          type: 'variant',
          productId: String(plain._id),
          name: plain.name || '',
          sku: v.sku || plain.sku || '',
          category: plain.category || '',
          stock: vStock,
          threshold,
          variantName: v.name || '',
        })
      }
    }
  }

  items.sort((a, b) => a.stock - b.stock)
  res.json({ items, total: items.length })
}

module.exports = { adminLowStock }
