const Product = require('../Models/Product')

const Order = require('../Models/Order')

const Review = require('../Models/Review')

const Customer = require('../Models/Customer')



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



function pctChange(current, previous) {

  const c = Number(current) || 0

  const p = Number(previous) || 0

  if (p === 0) return c > 0 ? 100 : 0

  return Math.round(((c - p) / p) * 1000) / 10

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

    keys.map((date) => [date, { date, revenue: 0, orders: 0 }])

  )

  const since = daysAgo(days - 1)

  since.setHours(0, 0, 0, 0)



  for (const o of orders) {

    const parsed = parseOrderDate(o)

    if (!parsed || parsed < since) continue

    const day = parsed.toISOString().slice(0, 10)

    if (!byDay[day]) continue

    byDay[day].revenue += Number(o.total) || 0

    byDay[day].orders += 1

  }

  return keys.map((date) => byDay[date])

}



function mapLowStockItems(products, limit = 5) {

  const items = []

  for (const p of products) {

    const threshold = p.lowStockThreshold != null ? Number(p.lowStockThreshold) : 5

    const productStock = Number(p.stock) || 0

    if (productStock <= threshold) {

      items.push({

        productId: String(p._id),

        name: p.name || '',

        sku: p.sku || '',

        stock: productStock,

        threshold,

        variantName: null,

        image: p.image || (Array.isArray(p.images) ? p.images[0] : '') || '',

      })

    }

    const variants = Array.isArray(p.variants) ? p.variants : []

    for (const v of variants) {

      const vStock = Number(v.stock) || 0

      if (vStock <= threshold) {

        items.push({

          productId: String(p._id),

          name: p.name || '',

          sku: v.sku || p.sku || '',

          stock: vStock,

          threshold,

          variantName: v.name || '',

          image: (Array.isArray(v.images) ? v.images[0] : '') || p.image || '',

        })

      }

    }

  }

  return items.sort((a, b) => a.stock - b.stock).slice(0, limit)

}



function buildTopSelling(orders, productDocs, since, limit = 5) {

  const sales = {}

  for (const o of orders) {

    const parsed = parseOrderDate(o)

    if (!parsed || parsed < since) continue

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



  const productMap = Object.fromEntries(

    productDocs.map((p) => [

      String(p._id),

      {

        name: p.name || '',

        image: p.image || (Array.isArray(p.images) ? p.images[0] : '') || '',

        price: p.price,

      },

    ])

  )



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



function summarizePeriod(orders, start, end) {

  const totals = []

  for (const o of orders) {

    const d = parseOrderDate(o)

    if (!d || d < start || d >= end) continue

    totals.push(Number(o.total) || 0)

  }

  const revenue = totals.reduce((s, n) => s + n, 0)

  const count = totals.length

  return { revenue, orders: count, aov: count > 0 ? revenue / count : 0 }

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



function buildOrderOverview(allOrders) {

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

  for (const o of allOrders) {
    let st = String(o.status || 'Placed')
    if (st === 'Pending') st = 'Placed'
    if (st === 'Processing') st = 'Packed'
    if (st === 'Paid') st = 'Confirmed'
    if (counts[st] != null) counts[st]++
  }

  return counts

}



async function adminDashboardSummary(req, res) {

  const days = Math.min(90, Math.max(7, Number(req.query.days) || 7))

  const since = daysAgo(days)

  const prevStart = daysAgo(days * 2)

  const prevEnd = daysAgo(days)



  const [

    productCount,

    publishedCount,

    customerCount,

    newCustomers,

    prevNewCustomers,

    pendingReviews,

    lowStockProducts,

    allOrders,

    recentOrders,

    pendingReviewDocs,

    productDocs,

  ] = await Promise.all([

    Product.countDocuments(),

    Product.countDocuments({ published: true }),

    Customer.countDocuments(),

    Customer.countDocuments({ createdAt: { $gte: since } }),

    Customer.countDocuments({ createdAt: { $gte: prevStart, $lt: prevEnd } }),

    Review.countDocuments({ status: 'pending' }),

    Product.find({

      $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] },

    })

      .select('name sku stock lowStockThreshold category variants image images')

      .limit(500)

      .lean(),

    Order.find().select('total status paymentStatus date createdAt items').lean(),

    Order.find()

      .sort({ date: -1 })

      .limit(6)

      .select('publicId total status paymentStatus date createdAt customerName customerEmail')

      .lean(),

    Review.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean(),

    Product.find({ published: true }).select('name image images price').lean(),

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



  const now = new Date()

  const current = summarizePeriod(allOrders, since, now)

  const previous = summarizePeriod(allOrders, prevStart, prevEnd)



  const statusCounts = {}

  for (const o of allOrders) {

    const st = String(o.status || 'Processing')

    statusCounts[st] = (statusCounts[st] || 0) + 1

  }



  const processingOrders =
    (statusCounts.Placed || 0) +
    (statusCounts.Pending || 0) +
    (statusCounts.Confirmed || 0) +
    (statusCounts.Packed || 0) +
    (statusCounts.Processing || 0) +
    (statusCounts.Shipped || 0) +
    (statusCounts['Out For Delivery'] || 0)



  res.json({

    days,

    productCount,

    publishedCount,

    customerCount,

    newCustomers,

    orderCount: allOrders.length,

    processingOrders,

    pendingReviews,

    lowStockCount,

    revenue7d: current.revenue,

    revenue30d: current.revenue,

    orders7d: current.orders,

    aov7d: current.aov,

    trends: {

      revenue: pctChange(current.revenue, previous.revenue),

      orders: pctChange(current.orders, previous.orders),

      aov: pctChange(current.aov, previous.aov),

      customers: pctChange(newCustomers, prevNewCustomers),

      processing: pctChange(

        processingPlacedInPeriod(allOrders, since, now),

        processingPlacedInPeriod(allOrders, prevStart, prevEnd)

      ),

    },

    statusCounts,

    orderOverview: buildOrderOverview(allOrders),

    revenueSeries: buildRevenueSeries(allOrders, days),

    lowStockItems: mapLowStockItems(lowStockProducts, 5),

    topSellingProducts: buildTopSelling(allOrders, productDocs, since, 5),

    pendingReviewItems: pendingReviewDocs.map((r) => ({

      id: String(r._id),

      productId: r.productId,

      customerName: r.customerName || 'Customer',

      rating: r.rating,

      title: r.title || '',

      createdAt: r.createdAt,

    })),

    recentOrders: recentOrders.map((o) => {

      const doc = { ...o, id: o.publicId }

      delete doc._id

      delete doc.publicId

      return doc

    }),

  })

}



module.exports = { adminDashboardSummary }

