const Product = require('../Models/Product')
const { getOrCreateSettings } = require('./helpers/siteSettings')
const { isValidObjectId } = require('./helpers/mongoIds')
const { parsePagination, paginatedResponse, parseSort } = require('./helpers/pagination')
function normalizeImagesFromBody(body) {
  if (Array.isArray(body.imagesMeta) && body.imagesMeta.length > 0) {
    const meta = body.imagesMeta
      .map((x) => ({
        url: String(x?.url || '').trim(),
        alt: String(x?.alt || '').trim(),
      }))
      .filter((x) => x.url)
    return {
      images: meta.map((m) => m.url),
      imagesMeta: meta,
    }
  }
  const images =
    Array.isArray(body.images) && body.images.length > 0
      ? body.images.map((u) => String(u || '').trim()).filter(Boolean)
      : body.image
        ? [String(body.image).trim()]
        : []
  return {
    images,
    imagesMeta: images.map((url) => ({ url, alt: '' })),
  }
}

function buildProductFilter(query) {
  const filter = {}
  const q = String(query.q || '').trim()
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { sku: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
    ]
  }
  if (query.category) filter.category = String(query.category).trim()
  if (query.published === 'true') filter.published = true
  if (query.published === 'false') filter.published = false
  if (query.featured === 'true') filter.featured = true
  if (query.stock === 'low') {
    filter.$expr = { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] }
  }
  if (query.stock === 'out') filter.stock = { $lte: 0 }
  return filter
}

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

async function adminListProducts(req, res) {
  const { page, limit, skip, sort, q } = parsePagination(req.query)
  const filter = buildProductFilter({ ...req.query, q })
  const sortObj = parseSort(sort, { createdAt: 'createdAt', name: 'name', price: 'price', stock: 'stock' })
  const [docs, total] = await Promise.all([
    Product.find(filter).sort(sortObj).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ])
  const items = docs.map((d) => d.toJSON())
  res.json(paginatedResponse(items, total, page, limit))
}

async function adminGetProduct(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const doc = await Product.findById(id)
  if (!doc) {
    return res.status(404).json({ message: 'Product not found' })
  }
  res.json(doc.toJSON())
}

async function adminBulkProducts(req, res) {
  const { ids, action, payload } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'ids array required' })
  }
  const validIds = ids.filter((id) => isValidObjectId(id))
  if (!validIds.length) {
    return res.status(400).json({ message: 'No valid product ids' })
  }
  let result
  if (action === 'delete') {
    result = await Product.deleteMany({ _id: { $in: validIds } })
    const settings = await getOrCreateSettings()
    const idSet = new Set(validIds.map(String))
    settings.newArrivalProductIds = (settings.newArrivalProductIds || []).filter((x) => !idSet.has(x))
    await settings.save()
    return res.json({ modified: result.deletedCount })
  }
  const updates = {}
  if (action === 'publish') updates.published = true
  if (action === 'unpublish') updates.published = false
  if (action === 'feature') updates.featured = true
  if (action === 'unfeature') updates.featured = false
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'Unknown action' })
  }
  result = await Product.updateMany({ _id: { $in: validIds } }, { $set: updates })
  res.json({ modified: result.modifiedCount })
}

async function adminCreateProduct(req, res) {
  const body = req.body || {}
  const { images, imagesMeta } = normalizeImagesFromBody(body)
  const doc = await Product.create({
    name: body.name,
    sku: body.sku,
    category: body.category,
    subcategory: body.subcategory,
    tags: Array.isArray(body.tags) ? body.tags : [],
    price: body.price,
    originalPrice: body.originalPrice,
    discountType: body.discountType,
    discountValue: body.discountValue,
    images,
    imagesMeta,
    description: body.description,
    shortDescription: body.shortDescription,
    specifications: body.specifications,
    material: body.material,
    weight: body.weight,
    sizeOptions: Array.isArray(body.sizeOptions) ? body.sizeOptions : [],
    dimensions: body.dimensions,
    customAttributes: Array.isArray(body.customAttributes) ? body.customAttributes : [],
    variants: Array.isArray(body.variants) ? body.variants : [],
    stock: body.stock != null ? body.stock : 10,
    lowStockThreshold: body.lowStockThreshold != null ? body.lowStockThreshold : 5,
    published: body.published !== false,
    featured: !!body.featured,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    seoKeywords: Array.isArray(body.seoKeywords) ? body.seoKeywords : [],
    shipping: body.shipping,
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
  if (body.sku !== undefined) updates.sku = body.sku
  if (body.category !== undefined) updates.category = body.category
  if (body.subcategory !== undefined) updates.subcategory = body.subcategory
  if (body.tags !== undefined) updates.tags = body.tags
  if (body.price !== undefined) updates.price = body.price
  if (body.originalPrice !== undefined) updates.originalPrice = body.originalPrice
  if (body.discountType !== undefined) updates.discountType = body.discountType
  if (body.discountValue !== undefined) updates.discountValue = body.discountValue
  if (body.description !== undefined) updates.description = body.description
  if (body.shortDescription !== undefined) updates.shortDescription = body.shortDescription
  if (body.specifications !== undefined) updates.specifications = body.specifications
  if (body.material !== undefined) updates.material = body.material
  if (body.weight !== undefined) updates.weight = body.weight
  if (body.sizeOptions !== undefined) updates.sizeOptions = body.sizeOptions
  if (body.dimensions !== undefined) updates.dimensions = body.dimensions
  if (body.customAttributes !== undefined) updates.customAttributes = body.customAttributes
  if (body.variants !== undefined) updates.variants = body.variants
  if (body.stock !== undefined) updates.stock = body.stock
  if (body.lowStockThreshold !== undefined) updates.lowStockThreshold = body.lowStockThreshold
  if (body.published !== undefined) updates.published = body.published
  if (body.featured !== undefined) updates.featured = body.featured
  if (body.seoTitle !== undefined) updates.seoTitle = body.seoTitle
  if (body.seoDescription !== undefined) updates.seoDescription = body.seoDescription
  if (body.seoKeywords !== undefined) updates.seoKeywords = body.seoKeywords
  if (body.shipping !== undefined) updates.shipping = body.shipping
  if (body.imagesMeta !== undefined || body.images !== undefined || body.image !== undefined) {
    const normalized = normalizeImagesFromBody(body)
    updates.images = normalized.images
    updates.imagesMeta = normalized.imagesMeta
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
  adminGetProduct,
  adminBulkProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminListCategories,
  adminReplaceCategories,
  adminListNewArrivalIds,
  adminSaveNewArrivalIds,
}
