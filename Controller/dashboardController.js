const Product = require('../Models/Product')
const Order = require('../Models/Order')
const Review = require('../Models/Review')
const Customer = require('../Models/Customer')
const SiteSettings = require('../Models/SiteSettings')
const { isCodPayment } = require('./helpers/orderWorkflow')

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function parseOrderDate(order) {
  const raw = order.placedAt || order.date || order.createdAt
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function pctChange(current, previous) {
  const c = Number(current) || 0
  const p = Number(previous) || 0
  if (p === 0) return c > 0 ? 100 : 0
  return Math.round(((c - p) / p) * 1000) / 10
}

function isCancelled(status) {
  return String(status || '') === 'Cancelled'
}

function isRefunded(paymentStatus) {
  return String(paymentStatus || '').toLowerCase() === 'refunded'
}

function buildRevenueSeries(orders, days = 7) {
  const keys = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    keys.push(d.toISOString().slice(0, 10))
  }
  const byDay = Object.fromEntries(
    keys.map((date) => [date, { date, revenue: 0, gross: 0, orders: 0 }])
  )
  const since = daysAgo(days - 1)
  since.setHours(0, 0, 0, 0)

  for (const o of orders) {
    if (isCancelled(o.status)) continue
    const parsed = parseOrderDate(o)
    if (!parsed || parsed < since) continue
    const day = parsed.toISOString().slice(0, 10)
    if (!byDay[day]) continue
    const total = Number(o.total) || 0
    byDay[day].gross += total
    if (!isRefunded(o.paymentStatus)) byDay[day].revenue += total
    byDay[day].orders += 1
  }
  return keys.map((date) => byDay[date])
}

function availableUnits(stock, reserved) {
  return Math.max(0, (Number(stock) || 0) - (Number(reserved) || 0))
}

function mapLowStockItems(products, limit = 5) {
  const items = []
  for (const p of products) {
    const threshold = p.lowStockThreshold != null ? Number(p.lowStockThreshold) : 5
    const variants = Array.isArray(p.variants) ? p.variants : []
    if (variants.length === 0) {
      const available = availableUnits(p.stock, p.reservedStock)
      if (available <= threshold) {
        items.push({
          productId: String(p._id),
          name: p.name || '',
          sku: p.sku || '',
          stock: available,
          threshold,
          variantName: null,
          image: p.image || (Array.isArray(p.images) ? p.images[0] : '') || '',
        })
      }
      continue
    }
    for (const v of variants) {
      const available = availableUnits(v.stock, v.reservedStock)
      if (available <= threshold) {
        items.push({
          productId: String(p._id),
          name: p.name || '',
          sku: v.sku || p.sku || '',
          stock: available,
          threshold,
          variantName: v.name || '',
          image: (Array.isArray(v.images) ? v.images[0] : '') || p.image || '',
        })
      }
    }
  }
  return items.sort((a, b) => a.stock - b.stock).slice(0, limit)
}

function countLowStockSkus(products) {
  let count = 0
  for (const p of products) {
    const threshold = p.lowStockThreshold != null ? Number(p.lowStockThreshold) : 5
    const variants = Array.isArray(p.variants) ? p.variants : []
    if (variants.length === 0) {
      if (availableUnits(p.stock, p.reservedStock) <= threshold) count += 1
      continue
    }
    for (const v of variants) {
      if (availableUnits(v.stock, v.reservedStock) <= threshold) count += 1
    }
  }
  return count
}

function buildProductMap(productDocs) {
  return Object.fromEntries(
    productDocs.map((p) => [
      String(p._id),
      {
        name: p.name || '',
        image: p.image || (Array.isArray(p.images) ? p.images[0] : '') || '',
        price: p.price,
      },
    ])
  )
}

function buildTopSelling(orders, productDocs, since, end, limit = 5) {
  const sales = {}
  for (const o of orders) {
    if (isCancelled(o.status)) continue
    const parsed = parseOrderDate(o)
    if (!parsed || parsed < since || parsed >= end) continue
    const items = Array.isArray(o.items) ? o.items : []
    for (const item of items) {
      const productId = String(item.productId || item.id || '')
      if (!productId) continue
      const qty = Number(item.quantity || item.qty || 1)
      const lineTotal = Number(item.lineTotal ?? item.total ?? (Number(item.price) || 0) * qty)
      if (!sales[productId]) {
        sales[productId] = { productId, name: item.name || 'Product', qty: 0, revenue: 0 }
      }
      sales[productId].qty += qty
      sales[productId].revenue += lineTotal
      if (item.name) sales[productId].name = item.name
    }
  }

  const productMap = buildProductMap(productDocs)
  return Object.values(sales)
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      name: productMap[row.productId]?.name || row.name,
      image: productMap[row.productId]?.image || '',
      price: productMap[row.productId]?.price,
    }))
}

function summarizeRevenueBreakdown(orders, start, end) {
  let gross = 0
  let refunds = 0
  let refundOrderCount = 0
  let orderCount = 0

  for (const o of orders) {
    const d = parseOrderDate(o)
    if (!d || d < start || d >= end) continue
    if (isCancelled(o.status)) continue
    const total = Number(o.total) || 0
    gross += total
    orderCount += 1
    if (isRefunded(o.paymentStatus)) {
      refunds += total
      refundOrderCount += 1
    }
  }

  const net = gross - refunds
  return {
    gross,
    refunds,
    net,
    refundOrderCount,
    orders: orderCount,
    aov: orderCount > 0 ? gross / orderCount : 0,
  }
}

function processingPlacedInPeriod(orders, start, end) {
  let n = 0
  const active = new Set([
    'Placed',
    'Pending',
    'Confirmed',
    'Packed',
    'Processing',
    'Shipped',
    'Out For Delivery',
  ])

  for (const o of orders) {
    if (!active.has(String(o.status || 'Pending'))) continue
    const d = parseOrderDate(o)
    if (!d || d < start || d >= end) continue
    n++
  }
  return n
}

function buildOrderOverviewFromAgg(statusAgg) {
  const counts = {
    Placed: 0,
    Confirmed: 0,
    Packed: 0,
    Shipped: 0,
    'Out For Delivery': 0,
    Delivered: 0,
    Cancelled: 0,
    'Return Requested': 0,
    Returned: 0,
    Pending: 0,
    Processing: 0,
  }

  for (const row of statusAgg) {
    let st = String(row._id || 'Placed')
    if (st === 'Pending') st = 'Placed'
    if (st === 'Processing') st = 'Packed'
    if (st === 'Paid') st = 'Confirmed'
    if (counts[st] != null) counts[st] += row.count
  }
  return counts
}

function buildPaymentSplit(orders, since, end) {
  const cod = { orders: 0, revenue: 0 }
  const prepaid = { orders: 0, revenue: 0 }
  let codAtRisk = 0

  for (const o of orders) {
    const d = parseOrderDate(o)
    if (!d || d < since || d >= end) continue
    if (isCancelled(o.status)) continue
    const total = Number(o.total) || 0
    if (isCodPayment(o.paymentMethod)) {
      cod.orders += 1
      cod.revenue += total
      const st = String(o.status || '')
      if (st === 'Placed' || st === 'Pending' || st === 'Confirmed') codAtRisk += 1
    } else {
      prepaid.orders += 1
      prepaid.revenue += total
    }
  }

  const totalRev = cod.revenue + prepaid.revenue
  const sharePct = (n) => (totalRev > 0 ? Math.round((n / totalRev) * 1000) / 10 : 0)

  return {
    cod: { ...cod, sharePct: sharePct(cod.revenue) },
    prepaid: { ...prepaid, sharePct: sharePct(prepaid.revenue) },
    codAtRisk: { orders: codAtRisk },
  }
}

function buildCampaignGroup(orders, productIds, productDocs, since, end) {
  const ids = (productIds || []).map(String).filter(Boolean)
  const idSet = new Set(ids)
  const sales = {}

  for (const id of ids) {
    sales[id] = { productId: id, qty: 0, revenue: 0, name: 'Product' }
  }

  for (const o of orders) {
    if (isCancelled(o.status)) continue
    const d = parseOrderDate(o)
    if (!d || d < since || d >= end) continue
    const items = Array.isArray(o.items) ? o.items : []
    for (const item of items) {
      const productId = String(item.productId || item.id || '')
      if (!idSet.has(productId)) continue
      const qty = Number(item.quantity || item.qty || 1)
      const lineTotal = Number(item.lineTotal ?? item.total ?? (Number(item.price) || 0) * qty)
      sales[productId].qty += qty
      sales[productId].revenue += lineTotal
      if (item.name) sales[productId].name = item.name
    }
  }

  const productMap = buildProductMap(productDocs)
  const products = ids
    .map((id) => ({
      productId: id,
      name: productMap[id]?.name || sales[id]?.name || 'Product',
      image: productMap[id]?.image || '',
      qty: sales[id]?.qty || 0,
      revenue: sales[id]?.revenue || 0,
    }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)

  const unitsSold = products.reduce((s, p) => s + p.qty, 0)
  const revenue = products.reduce((s, p) => s + p.revenue, 0)

  return {
    configured: ids.length,
    unitsSold,
    revenue,
    products,
  }
}

function buildActionQueue({
  ordersToConfirm,
  pendingReviews,
  lowStockSkus,
  placedOrderPreview,
  pendingReviewItems,
  lowStockItems,
}) {
  return {
    ordersToConfirm,
    pendingReviews,
    lowStockSkus,
    preview: {
      orders: placedOrderPreview.map((o) => ({
        id: o.publicId,
        customerName: o.customerName || '—',
        total: Number(o.total) || 0,
        paymentMethod: o.paymentMethod || 'cod',
      })),
      reviews: pendingReviewItems,
      lowStock: lowStockItems,
    },
  }
}

function periodOrderFilter(prevStart) {
  const prevStartISO = prevStart.toISOString().slice(0, 10)
  return {
    $or: [
      { placedAt: { $gte: prevStart } },
      { date: { $gte: prevStartISO } },
      { createdAt: { $gte: prevStart } },
    ],
  }
}

async function adminDashboardSummary(req, res) {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 7))
  const since = daysAgo(days)
  const prevStart = daysAgo(days * 2)
  const prevEnd = daysAgo(days)
  const now = new Date()

  const [
    productCount,
    publishedCount,
    customerCount,
    newCustomers,
    prevNewCustomers,
    pendingReviews,
    ordersToConfirm,
    lowStockProducts,
    periodOrders,
    recentOrders,
    placedOrderPreview,
    pendingReviewDocs,
    productDocs,
    siteSettings,
    orderCount,
    statusAgg,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ published: true }),
    Customer.countDocuments(),
    Customer.countDocuments({ createdAt: { $gte: since } }),
    Customer.countDocuments({ createdAt: { $gte: prevStart, $lt: prevEnd } }),
    Review.countDocuments({ status: 'pending' }),
    Order.countDocuments({ status: { $in: ['Placed', 'Pending'] } }),
    Product.find()
      .select('name sku stock reservedStock lowStockThreshold category variants image images')
      .limit(500)
      .lean(),
    Order.find(periodOrderFilter(prevStart))
      .select('total status paymentStatus paymentMethod date createdAt placedAt items')
      .lean(),
    Order.find()
      .sort({ date: -1 })
      .limit(6)
      .select('publicId total status paymentStatus date createdAt customerName customerEmail')
      .lean(),
    Order.find({ status: { $in: ['Placed', 'Pending'] } })
      .sort({ placedAt: -1, date: -1 })
      .limit(3)
      .select('publicId total customerName paymentMethod')
      .lean(),
    Review.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean(),
    Product.find({ published: true }).select('name image images price').lean(),
    SiteSettings.findOne().lean(),
    Order.countDocuments(),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ])

  const lowStockCount = countLowStockSkus(lowStockProducts)

  const lowStockItems = mapLowStockItems(lowStockProducts, 5)
  const pendingReviewItems = pendingReviewDocs.map((r) => ({
    id: String(r._id),
    productId: r.productId,
    customerName: r.customerName || 'Customer',
    rating: r.rating,
    title: r.title || '',
    createdAt: r.createdAt,
  }))

  const current = summarizeRevenueBreakdown(periodOrders, since, now)
  const previous = summarizeRevenueBreakdown(periodOrders, prevStart, prevEnd)

  const orderOverview = buildOrderOverviewFromAgg(statusAgg)
  const statusCounts = { ...orderOverview }

  const processingOrders =
    (statusCounts.Placed || 0) +
    (statusCounts.Pending || 0) +
    (statusCounts.Confirmed || 0) +
    (statusCounts.Packed || 0) +
    (statusCounts.Processing || 0) +
    (statusCounts.Shipped || 0) +
    (statusCounts['Out For Delivery'] || 0)

  const paymentSplit = buildPaymentSplit(periodOrders, since, now)

  const newArrivalIds = siteSettings?.newArrivalProductIds || []
  const featuredIds = siteSettings?.featuredProductIds || []

  const newArrivals = buildCampaignGroup(periodOrders, newArrivalIds, productDocs, since, now)
  const featured = buildCampaignGroup(periodOrders, featuredIds, productDocs, since, now)

  const campaignPerformance = {
    newArrivals,
    featured,
    combined: {
      configured: newArrivals.configured + featured.configured,
      unitsSold: newArrivals.unitsSold + featured.unitsSold,
      revenue: newArrivals.revenue + featured.revenue,
    },
  }

  const actionQueue = buildActionQueue({
    ordersToConfirm,
    pendingReviews,
    lowStockSkus: lowStockCount,
    placedOrderPreview,
    pendingReviewItems,
    lowStockItems,
  })

  res.json({
    days,
    productCount,
    publishedCount,
    customerCount,
    newCustomers,
    orderCount,
    processingOrders,
    pendingReviews,
    lowStockCount,
    revenue: {
      gross: current.gross,
      refunds: current.refunds,
      net: current.net,
      refundOrderCount: current.refundOrderCount,
    },
    revenue7d: current.net,
    revenue30d: current.net,
    orders7d: current.orders,
    aov7d: current.aov,
    trends: {
      revenue: pctChange(current.gross, previous.gross),
      netRevenue: pctChange(current.net, previous.net),
      refunds: pctChange(current.refunds, previous.refunds),
      orders: pctChange(current.orders, previous.orders),
      aov: pctChange(current.aov, previous.aov),
      customers: pctChange(newCustomers, prevNewCustomers),
      processing: pctChange(
        processingPlacedInPeriod(periodOrders, since, now),
        processingPlacedInPeriod(periodOrders, prevStart, prevEnd)
      ),
    },
    statusCounts,
    orderOverview,
    revenueSeries: buildRevenueSeries(periodOrders, days),
    paymentSplit,
    campaignPerformance,
    actionQueue,
    lowStockItems,
    topSellingProducts: buildTopSelling(periodOrders, productDocs, since, now, 5),
    pendingReviewItems,
    recentOrders: recentOrders.map((o) => {
      const doc = { ...o, id: o.publicId }
      delete doc._id
      delete doc.publicId
      return doc
    }),
  })
}

module.exports = { adminDashboardSummary }
