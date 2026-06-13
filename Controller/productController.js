const Product = require('../Models/Product')
const toClientProduct = Product.toClientProduct
const SizeChart = require('../Models/SizeChart')
const { getOrCreateSettings } = require('./helpers/siteSettings')
const { isValidObjectId } = require('./helpers/mongoIds')
const { parsePagination, paginatedResponse, parseSort } = require('./helpers/pagination')
const { publishDueProducts } = require('./helpers/scheduledPublish')
const { productsToCsv, importProductsFromCsv } = require('./helpers/productCsv')
const { availableUnits } = require('./helpers/stockInventory')
const {
  getStorefrontListing,
  invalidatePublishedCache,
  loadPublishedProducts,
} = require('./helpers/storefrontListing')

function toStorefrontProduct(json) {
  const out = { ...json }
  out.stock = availableUnits(json.stock, json.reservedStock)
  delete out.reservedStock
  if (Array.isArray(out.variants)) {
    out.variants = out.variants.map((v) => {
      const masked = { ...v }
      masked.stock = availableUnits(v.stock, v.reservedStock)
      delete masked.reservedStock
      return masked
    })
  }
  return out
}

function applyMakingChargePrice(body) {
  if (!body?.useMakingChargePricing) return body
  const metal = Number(body.metalValue) || 0
  const making = Number(body.makingCharge) || 0
  return { ...body, price: metal + making }
}

function parsePublishAt(raw) {
  if (raw === null || raw === '') return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

async function attachSizeChart(productJson) {
  const chartId = String(productJson.sizeChartId || '').trim()
  if (!chartId || !isValidObjectId(chartId)) return productJson
  const chart = await SizeChart.findById(chartId).lean()
  if (!chart) return productJson
  return {
    ...productJson,
    sizeChart: {
      id: String(chart._id),
      name: chart.name || '',
      type: chart.type || 'general',
      rows: Array.isArray(chart.rows) ? chart.rows : [],
    },
  }
}
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
  const products = await loadPublishedProducts()
  res.json({ products })
}

async function listPublishedProductsListing(req, res) {
  const result = await getStorefrontListing(req.query)
  res.json(result)
}

async function getPublishedProductById(req, res) {
  await publishDueProducts()
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const doc = await Product.findById(id)
  if (!doc || doc.published === false) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const json = await attachSizeChart(toStorefrontProduct(doc.toJSON()))
  res.json(json)
}

async function getPublicSizeChart(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Size chart not found' })
  }
  const doc = await SizeChart.findById(id)
  if (!doc) {
    return res.status(404).json({ message: 'Size chart not found' })
  }
  res.json(doc.toJSON())
}

async function listPublicNewArrivalIds(_req, res) {
  const settings = await getOrCreateSettings()
  res.json({ ids: settings.newArrivalProductIds || [] })
}

async function listPublicNewArrivalProducts(_req, res) {
  await publishDueProducts()
  const settings = await getOrCreateSettings()
  const ids = (settings.newArrivalProductIds || []).map(String).filter(Boolean)

  if (ids.length > 0) {
    const validIds = ids.filter((id) => isValidObjectId(id))
    const docs = await Product.find({ _id: { $in: validIds }, published: true }).lean()
    const byId = new Map(docs.map((d) => [String(d._id), d]))
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean)
    if (ordered.length > 0) {
      return res.json({
        products: ordered.slice(0, 12).map((d) => toStorefrontProduct(toClientProduct(d))),
      })
    }
  }

  const docs = await Product.find({ published: true }).sort({ createdAt: -1 }).limit(6).lean()
  res.json({
    products: docs.map((d) => toStorefrontProduct(toClientProduct(d))),
  })
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
    invalidatePublishedCache()
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
  invalidatePublishedCache()
  res.json({ modified: result.modifiedCount })
}

async function adminCreateProduct(req, res) {
  const body = applyMakingChargePrice(req.body || {})
  const { images, imagesMeta } = normalizeImagesFromBody(body)
  const publishAt = parsePublishAt(body.publishAt)
  const scheduled = publishAt && publishAt > new Date()
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
    metalValue: body.metalValue != null ? Number(body.metalValue) : 0,
    makingCharge: body.makingCharge != null ? Number(body.makingCharge) : 0,
    useMakingChargePricing: !!body.useMakingChargePricing,
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
    published: scheduled ? false : body.published !== false,
    featured: !!body.featured,
    publishAt: scheduled ? publishAt : null,
    sizeChartId: body.sizeChartId != null ? String(body.sizeChartId).trim() : '',
    certification: body.certification,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    seoKeywords: Array.isArray(body.seoKeywords) ? body.seoKeywords : [],
    shipping: body.shipping,
  })
  invalidatePublishedCache()
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
  if (body.metalValue !== undefined) updates.metalValue = Number(body.metalValue) || 0
  if (body.makingCharge !== undefined) updates.makingCharge = Number(body.makingCharge) || 0
  if (body.useMakingChargePricing !== undefined) updates.useMakingChargePricing = !!body.useMakingChargePricing
  if (body.published !== undefined) updates.published = body.published
  if (body.featured !== undefined) updates.featured = body.featured
  if (body.publishAt !== undefined) updates.publishAt = parsePublishAt(body.publishAt)
  if (body.sizeChartId !== undefined) updates.sizeChartId = String(body.sizeChartId || '').trim()
  if (body.certification !== undefined) updates.certification = body.certification
  if (body.seoTitle !== undefined) updates.seoTitle = body.seoTitle
  if (body.seoDescription !== undefined) updates.seoDescription = body.seoDescription
  if (body.seoKeywords !== undefined) updates.seoKeywords = body.seoKeywords
  if (body.shipping !== undefined) updates.shipping = body.shipping
  if (body.imagesMeta !== undefined || body.images !== undefined || body.image !== undefined) {
    const normalized = normalizeImagesFromBody(body)
    updates.images = normalized.images
    updates.imagesMeta = normalized.imagesMeta
  }
  if (
    body.useMakingChargePricing !== undefined ||
    body.metalValue !== undefined ||
    body.makingCharge !== undefined
  ) {
    const existing = await Product.findById(id).lean()
    const useMc =
      body.useMakingChargePricing !== undefined
        ? !!body.useMakingChargePricing
        : !!existing?.useMakingChargePricing
    if (useMc) {
      updates.price =
        (updates.metalValue != null ? updates.metalValue : Number(existing?.metalValue) || 0) +
        (updates.makingCharge != null ? updates.makingCharge : Number(existing?.makingCharge) || 0)
    }
  }

  if (updates.publishAt && updates.publishAt > new Date()) {
    updates.published = false
  } else if (updates.publishAt && updates.publishAt <= new Date()) {
    updates.published = true
    updates.publishAt = null
  }

  const doc = await Product.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
  if (!doc) {
    return res.status(404).json({ message: 'Product not found' })
  }
  invalidatePublishedCache()
  res.json(doc.toJSON())
}

async function adminDuplicateProduct(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const doc = await Product.findById(id).lean()
  if (!doc) {
    return res.status(404).json({ message: 'Product not found' })
  }
  const copy = { ...doc }
  delete copy._id
  delete copy.createdAt
  delete copy.updatedAt
  copy.name = `${copy.name || 'Product'} (Copy)`
  if (copy.sku) copy.sku = `${copy.sku}-COPY`
  copy.published = false
  copy.publishAt = null
  copy.featured = false
  const newDoc = await Product.create(copy)
  invalidatePublishedCache()
  res.status(201).json(newDoc.toJSON())
}

async function adminExportProducts(_req, res) {
  const docs = await Product.find().sort({ name: 1 })
  const csv = productsToCsv(docs)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"')
  res.send(csv)
}

async function adminImportProducts(req, res) {
  const csv = req.body?.csv
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ message: 'csv string required in request body' })
  }
  const result = await importProductsFromCsv(csv)
  invalidatePublishedCache()
  res.json(result)
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
  invalidatePublishedCache()
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
  listPublishedProductsListing,
  getPublishedProductById,
  getPublicSizeChart,
  listPublicNewArrivalIds,
  listPublicNewArrivalProducts,
  adminListProducts,
  adminGetProduct,
  adminBulkProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminDuplicateProduct,
  adminExportProducts,
  adminImportProducts,
  adminListCategories,
  adminReplaceCategories,
  adminListNewArrivalIds,
  adminSaveNewArrivalIds,
}
