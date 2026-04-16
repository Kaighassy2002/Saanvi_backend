const Product = require('../Models/Product')
const { getOrCreateSettings } = require('./helpers/siteSettings')
const { isValidObjectId } = require('./helpers/mongoIds')

// --- public catalog / merchandising ---

async function listCategories(_req, res) {
  const settings = await getOrCreateSettings()
  res.json({ categories: settings.categories || [] })
}

async function listPublishedProducts(_req, res) {
  const docs = await Product.find({ published: true }).sort({ createdAt: -1 })
  res.json({ products: docs.map((d) => d.toJSON()) })
}

async function getPublishedProductById(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const doc = await Product.findById(id)
  if (!doc || doc.published === false) {
    return res.status(404).json({ message: 'Product not found' })
  }
  res.json(doc.toJSON())
}

async function listPublicNewArrivalIds(_req, res) {
  const settings = await getOrCreateSettings()
  res.json({ ids: settings.newArrivalProductIds || [] })
}

// --- admin products ---

async function adminListProducts(_req, res) {
  const docs = await Product.find().sort({ createdAt: -1 })
  res.json({ products: docs.map((d) => d.toJSON()) })
}

async function adminCreateProduct(req, res) {
  const body = req.body || {}
  const images =
    Array.isArray(body.images) && body.images.length > 0
      ? body.images
      : body.image
        ? [body.image]
        : []
  const doc = await Product.create({
    name: body.name,
    category: body.category,
    price: body.price,
    originalPrice: body.originalPrice,
    images,
    description: body.description,
    specifications: body.specifications,
    published: body.published !== false,
    stock: body.stock != null ? body.stock : 10,
  })
  res.status(201).json(doc.toJSON())
}

async function adminUpdateProduct(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const body = req.body || {}
  const updates = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.category !== undefined) updates.category = body.category
  if (body.price !== undefined) updates.price = body.price
  if (body.originalPrice !== undefined) updates.originalPrice = body.originalPrice
  if (body.description !== undefined) updates.description = body.description
  if (body.specifications !== undefined) updates.specifications = body.specifications
  if (body.published !== undefined) updates.published = body.published
  if (body.stock !== undefined) updates.stock = body.stock
  if (Array.isArray(body.images) && body.images.length > 0) {
    updates.images = body.images
  } else if (body.image !== undefined) {
    updates.images = body.image ? [body.image] : []
  }
  const doc = await Product.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
  if (!doc) {
    return res.status(404).json({ message: 'Product not found' })
  }
  res.json(doc.toJSON())
}

async function adminDeleteProduct(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const doc = await Product.findByIdAndDelete(id)
  if (!doc) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const settings = await getOrCreateSettings()
  const sid = String(id)
  settings.newArrivalProductIds = (settings.newArrivalProductIds || []).filter((x) => x !== sid)
  await settings.save()
  res.status(204).end()
}

// --- admin categories ---

async function adminListCategories(_req, res) {
  const settings = await getOrCreateSettings()
  res.json({ categories: settings.categories || [] })
}

async function adminReplaceCategories(req, res) {
  const raw = req.body?.categories
  if (!Array.isArray(raw)) {
    return res.status(400).json({ message: 'categories array required' })
  }
  const categories = [...new Set(raw.map((c) => String(c).trim()).filter(Boolean))]
  const settings = await getOrCreateSettings()
  settings.categories = categories
  await settings.save()
  res.json({ categories: settings.categories })
}

// --- admin merchandising (new arrivals) ---

async function adminListNewArrivalIds(_req, res) {
  const settings = await getOrCreateSettings()
  res.json({ ids: settings.newArrivalProductIds || [] })
}

async function adminSaveNewArrivalIds(req, res) {
  const raw = req.body?.ids
  if (!Array.isArray(raw)) {
    return res.status(400).json({ message: 'ids array required' })
  }
  const ids = raw.map((x) => String(x))
  const settings = await getOrCreateSettings()
  settings.newArrivalProductIds = ids
  await settings.save()
  res.json({ ids: settings.newArrivalProductIds })
}

module.exports = {
  listCategories,
  listPublishedProducts,
  getPublishedProductById,
  listPublicNewArrivalIds,
  adminListProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminListCategories,
  adminReplaceCategories,
  adminListNewArrivalIds,
  adminSaveNewArrivalIds,
}
