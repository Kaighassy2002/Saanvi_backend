const Review = require('../Models/Review')
const Product = require('../Models/Product')
const Customer = require('../Models/Customer')
const { isValidObjectId } = require('./helpers/mongoIds')
const { customerPurchasedProduct } = require('./helpers/reviewPurchase')

function computeSummary(reviews) {
  const approved = reviews.filter((r) => r.status === 'approved')
  if (!approved.length) {
    return { average: 0, count: 0 }
  }
  const sum = approved.reduce((s, r) => s + Number(r.rating || 0), 0)
  return {
    average: Math.round((sum / approved.length) * 10) / 10,
    count: approved.length,
  }
}

async function listProductReviews(req, res) {
  const { id: productId } = req.params
  if (!isValidObjectId(productId)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const product = await Product.findById(productId)
  if (!product || product.published === false) {
    return res.status(404).json({ message: 'Product not found' })
  }

  const docs = await Review.find({ productId, status: 'approved' }).sort({ createdAt: -1 }).limit(50)
  const reviews = docs.map((d) => d.toJSON())
  const summary = computeSummary(reviews)

  let myReview = null
  let hasPurchased = false
  if (req.customer?.sub) {
    const mine = await Review.findOne({ productId, customerId: req.customer.sub })
    if (mine) myReview = mine.toJSON()
    hasPurchased = await customerPurchasedProduct(
      req.customer.sub,
      req.customer.email,
      productId
    )
  }

  const canReview = Boolean(hasPurchased && !myReview)

  res.json({ reviews, summary, myReview, hasPurchased, canReview })
}

async function createProductReview(req, res) {
  const { id: productId } = req.params
  if (!isValidObjectId(productId)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const product = await Product.findById(productId)
  if (!product || product.published === false) {
    return res.status(404).json({ message: 'Product not found' })
  }

  const rating = Number(req.body?.rating)
  const title = String(req.body?.title || '').trim().slice(0, 120)
  const body = String(req.body?.body || '').trim().slice(0, 2000)

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' })
  }
  if (!body || body.length < 10) {
    return res.status(400).json({ message: 'Review must be at least 10 characters' })
  }

  const customerId = req.customer.sub
  const purchased = await customerPurchasedProduct(
    customerId,
    req.customer.email,
    productId
  )
  if (!purchased) {
    return res.status(403).json({
      message: 'Only customers who purchased this product can leave a review.',
    })
  }

  const existing = await Review.findOne({ productId, customerId })
  if (existing) {
    return res.status(409).json({ message: 'You have already reviewed this product' })
  }

  let customerName = ''
  const customer = await Customer.findById(customerId)
  if (customer) {
    customerName = customer.name || Customer.buildDisplayName(customer.firstName, customer.lastName)
  }

  const doc = await Review.create({
    productId,
    customerId,
    customerName,
    rating,
    title,
    body,
    status: 'pending',
  })

  res.status(201).json({
    review: doc.toJSON(),
    message: 'Thank you! Your review will appear after moderation.',
  })
}

async function reviewSummaries(req, res) {
  const raw = String(req.query.ids || '')
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isValidObjectId(s))

  if (!ids.length) {
    return res.json({ summaries: {} })
  }

  const docs = await Review.find({ productId: { $in: ids }, status: 'approved' })
  const byProduct = {}
  for (const id of ids) {
    byProduct[id] = { average: 0, count: 0 }
  }
  const grouped = {}
  for (const doc of docs) {
    const pid = String(doc.productId)
    if (!grouped[pid]) grouped[pid] = []
    grouped[pid].push(doc)
  }
  for (const [pid, list] of Object.entries(grouped)) {
    byProduct[pid] = computeSummary(list.map((d) => d.toJSON()))
  }

  res.json({ summaries: byProduct })
}

async function adminListReviews(_req, res) {
  const docs = await Review.find().sort({ createdAt: -1 }).limit(200)
  res.json({ reviews: docs.map((d) => d.toJSON()) })
}

async function adminPatchReview(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Review not found' })
  }
  const status = req.body?.status
  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' })
  }
  const doc = await Review.findByIdAndUpdate(
    id,
    status ? { status } : {},
    { new: true, runValidators: true }
  )
  if (!doc) {
    return res.status(404).json({ message: 'Review not found' })
  }
  res.json(doc.toJSON())
}

async function adminDeleteReview(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Review not found' })
  }
  const doc = await Review.findByIdAndDelete(id)
  if (!doc) {
    return res.status(404).json({ message: 'Review not found' })
  }
  res.status(204).send()
}

module.exports = {
  listProductReviews,
  createProductReview,
  reviewSummaries,
  adminListReviews,
  adminPatchReview,
  adminDeleteReview,
}
