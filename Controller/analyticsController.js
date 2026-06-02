const Order = require('../Models/Order')
const Product = require('../Models/Product')

function parseDateRange(query) {
  const to = query.to ? new Date(query.to) : new Date()
  const from = query.from
    ? new Date(query.from)
    : (() => {
        const d = new Date(to)
        d.setDate(d.getDate() - 30)
        return d
      })()
  return { from, to }
}

function orderInRange(order, from, to) {
  const raw = order.date || order.createdAt
  if (!raw) return false
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return false
  return d >= from && d <= to
}

async function adminSalesAnalytics(req, res) {
  const { from, to } = parseDateRange(req.query)
  const orders = await Order.find().lean()
  const daily = {}

  for (const o of orders) {
    if (!orderInRange(o, from, to)) continue
    const day = new Date(o.date || o.createdAt).toISOString().slice(0, 10)
    if (!daily[day]) daily[day] = { date: day, revenue: 0, orders: 0 }
    daily[day].revenue += Number(o.total) || 0
    daily[day].orders += 1
  }

  const series = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date))
  const totalRevenue = series.reduce((s, x) => s + x.revenue, 0)
  const totalOrders = series.reduce((s, x) => s + x.orders, 0)

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    series,
    totalRevenue,
    totalOrders,
    aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  })
}

async function adminProductAnalytics(_req, res) {
  const products = await Product.find({ published: true }).select('name category price stock').lean()
  const byCategory = {}
  for (const p of products) {
    const cat = p.category || 'Uncategorized'
    if (!byCategory[cat]) byCategory[cat] = { category: cat, count: 0 }
    byCategory[cat].count += 1
  }
  const topByStock = [...products]
    .sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0))
    .slice(0, 10)
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      category: p.category,
      price: p.price,
      stock: p.stock,
    }))

  res.json({
    byCategory: Object.values(byCategory).sort((a, b) => b.count - a.count),
    topByStock,
    publishedCount: products.length,
  })
}

module.exports = { adminSalesAnalytics, adminProductAnalytics }
