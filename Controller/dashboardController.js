const Product = require('../Models/Product')
const Order = require('../Models/Order')
const Review = require('../Models/Review')

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function parseOrderDate(order) {
  const raw = order.date || order.createdAt
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

async function adminDashboardSummary(_req, res) {
  const since7 = daysAgo(7)
  const since30 = daysAgo(30)

  const [
    productCount,
    publishedCount,
    pendingReviews,
    lowStockProducts,
    allOrders,
    recentOrders,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ published: true }),
    Review.countDocuments({ status: 'pending' }),
    Product.find({
      $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] },
    })
      .select('name sku stock lowStockThreshold category')
      .limit(500)
      .lean(),
    Order.find().select('total status date createdAt').lean(),
    Order.find().sort({ date: -1 }).limit(10).lean(),
  ])

  let lowStockCount = lowStockProducts.length
  for (const p of lowStockProducts) {
    const threshold = p.lowStockThreshold != null ? Number(p.lowStockThreshold) : 5
    if (Array.isArray(p.variants)) {
      for (const v of p.variants) {
        if (Number(v.stock) <= threshold) lowStockCount += 1
      }
    }
  }

  const orders7d = []
  const orders30d = []
  const statusCounts = {}

  for (const o of allOrders) {
    const st = String(o.status || 'Processing')
    statusCounts[st] = (statusCounts[st] || 0) + 1
    const d = parseOrderDate(o)
    if (!d) continue
    const total = Number(o.total) || 0
    if (d >= since7) orders7d.push(total)
    if (d >= since30) orders30d.push(total)
  }

  const revenue7d = orders7d.reduce((s, n) => s + n, 0)
  const revenue30d = orders30d.reduce((s, n) => s + n, 0)
  const orders7dCount = orders7d.length
  const aov7d = orders7dCount > 0 ? revenue7d / orders7dCount : 0

  res.json({
    productCount,
    publishedCount,
    orderCount: allOrders.length,
    pendingReviews,
    lowStockCount,
    revenue7d,
    revenue30d,
    orders7d: orders7dCount,
    aov7d,
    statusCounts,
    recentOrders: recentOrders.map((o) => {
      const doc = { ...o, id: o.publicId }
      delete doc._id
      delete doc.publicId
      return doc
    }),
  })
}

module.exports = { adminDashboardSummary }
