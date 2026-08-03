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
  // Inclusive end-of-day for `to` date-only strings
  if (query.to && String(query.to).length <= 10) {
    to.setHours(23, 59, 59, 999)
  }
  return { from, to }
}

/**
 * Sales analytics via MongoDB aggregation (no full-collection hydration).
 * Uses placedAt with fallback to createdAt for legacy rows.
 */
async function adminSalesAnalytics(req, res) {
  const { from, to } = parseDateRange(req.query)

  const eventAtExpr = {
    $ifNull: [
      '$placedAt',
      {
        $ifNull: [
          '$createdAt',
          { $convert: { input: '$date', to: 'date', onError: null, onNull: null } },
        ],
      },
    ],
  }

  const pipeline = [
    { $addFields: { eventAt: eventAtExpr } },
    {
      $match: {
        eventAt: { $ne: null, $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$eventAt' },
        },
        revenue: { $sum: { $ifNull: ['$total', 0] } },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: '$_id',
        revenue: { $round: ['$revenue', 2] },
        orders: 1,
      },
    },
  ]

  const [series, totals] = await Promise.all([
    Order.aggregate(pipeline),
    Order.aggregate([
      { $addFields: { eventAt: eventAtExpr } },
      { $match: { eventAt: { $ne: null, $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ['$total', 0] } },
          totalOrders: { $sum: 1 },
        },
      },
    ]),
  ])

  const totalRevenue = Number(totals[0]?.totalRevenue) || 0
  const totalOrders = Number(totals[0]?.totalOrders) || 0

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    series,
    totalRevenue,
    totalOrders,
    aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  })
}

/**
 * Product analytics via aggregation — category counts + top stock without loading all docs into JS.
 */
async function adminProductAnalytics(_req, res) {
  const [byCategory, topByStock, publishedCountArr] = await Promise.all([
    Product.aggregate([
      { $match: { published: true } },
      {
        $group: {
          _id: { $ifNull: ['$category', 'Uncategorized'] },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, category: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Product.aggregate([
      { $match: { published: true } },
      { $sort: { stock: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          name: 1,
          category: 1,
          price: 1,
          stock: 1,
        },
      },
    ]),
    Product.aggregate([{ $match: { published: true } }, { $count: 'count' }]),
  ])

  res.json({
    byCategory,
    topByStock,
    publishedCount: Number(publishedCountArr[0]?.count) || 0,
  })
}

module.exports = { adminSalesAnalytics, adminProductAnalytics }
