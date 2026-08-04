const Collection = require('../Models/Collection')
const Product = require('../Models/Product')
const { toClientProduct } = require('../Models/Product')
const { isValidObjectId } = require('./helpers/mongoIds')
const { getOrCreateSettings } = require('./helpers/siteSettings')

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_PRODUCTS = 200

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function parseOptionalDate(value, field) {
  if (value === null || value === '' || value === undefined) return { value: null }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { error: { field, message: `Invalid ${field}` } }
  return { value: d }
}

function isWithinSchedule(doc, now = new Date()) {
  if (doc.startsAt && new Date(doc.startsAt) > now) return false
  if (doc.endsAt && new Date(doc.endsAt) < now) return false
  return true
}

function isStorefrontVisible(doc, now = new Date()) {
  return doc.published !== false && isWithinSchedule(doc, now)
}

function scheduleStatus(doc, now = new Date()) {
  if (doc.published === false) return 'draft'
  if (doc.startsAt && new Date(doc.startsAt) > now) return 'scheduled'
  if (doc.endsAt && new Date(doc.endsAt) < now) return 'ended'
  return 'live'
}

function publicCollectionSummary(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc, id: String(doc._id || doc.id) }
  return {
    id: json.id,
    name: json.name,
    slug: json.slug,
    heroImage: json.heroImage || '',
    description: json.description || '',
    productCount: Array.isArray(json.productIds) ? json.productIds.length : 0,
    sortOrder: json.sortOrder ?? 0,
    showOnHomepage: json.showOnHomepage === true,
    metaTitle: json.metaTitle || '',
    metaDescription: json.metaDescription || '',
    startsAt: json.startsAt || null,
    endsAt: json.endsAt || null,
  }
}

async function validateProductIds(productIds) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(String).filter(Boolean))]
  if (ids.length > MAX_PRODUCTS) {
    return { error: `A collection can include at most ${MAX_PRODUCTS} products` }
  }
  const invalid = ids.filter((id) => !isValidObjectId(id))
  if (invalid.length) {
    return { error: 'One or more product IDs are invalid' }
  }
  if (!ids.length) return { ids: [] }

  const found = await Product.find({ _id: { $in: ids } }).select({ _id: 1, published: 1 }).lean()
  const foundSet = new Set(found.map((d) => String(d._id)))
  const missing = ids.filter((id) => !foundSet.has(id))
  if (missing.length) {
    return { error: `${missing.length} product(s) could not be found` }
  }
  return { ids }
}

async function assertUniqueSlug(slug, excludeId = null) {
  const query = { slug }
  if (excludeId) query._id = { $ne: excludeId }
  const existing = await Collection.findOne(query).select('_id').lean()
  return !existing
}

function normalizePayload(body, { partial = false } = {}) {
  const errors = []
  const data = {}

  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) errors.push({ field: 'name', message: 'Collection name is required' })
    else data.name = name
  }

  if (!partial || body.slug !== undefined || (!partial && body.name)) {
    const rawSlug = body.slug != null && String(body.slug).trim() ? body.slug : body.name
    const slug = slugify(rawSlug)
    if (!slug || !SLUG_PATTERN.test(slug)) {
      errors.push({
        field: 'slug',
        message: 'Slug must be lowercase letters, numbers, and hyphens (e.g. onam-collection-2026)',
      })
    } else if (slug === 'featured') {
      errors.push({ field: 'slug', message: 'Slug "featured" is reserved' })
    } else {
      data.slug = slug
    }
  }

  if (!partial || body.heroImage !== undefined) {
    data.heroImage = String(body.heroImage || '').trim()
  }
  if (!partial || body.description !== undefined) {
    data.description = String(body.description || '').trim()
  }
  if (!partial || body.metaTitle !== undefined) {
    data.metaTitle = String(body.metaTitle || '').trim().slice(0, 70)
  }
  if (!partial || body.metaDescription !== undefined) {
    data.metaDescription = String(body.metaDescription || '').trim().slice(0, 160)
  }
  if (!partial || body.published !== undefined) {
    data.published = body.published === true || body.published === 'true'
  }
  if (!partial || body.showOnHomepage !== undefined) {
    data.showOnHomepage = body.showOnHomepage === true || body.showOnHomepage === 'true'
  }
  if (!partial || body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder ?? 0)
    if (!Number.isFinite(sortOrder)) errors.push({ field: 'sortOrder', message: 'Invalid sort order' })
    else data.sortOrder = sortOrder
  }

  if (!partial || body.startsAt !== undefined) {
    const parsed = parseOptionalDate(body.startsAt, 'startsAt')
    if (parsed.error) errors.push(parsed.error)
    else data.startsAt = parsed.value
  }
  if (!partial || body.endsAt !== undefined) {
    const parsed = parseOptionalDate(body.endsAt, 'endsAt')
    if (parsed.error) errors.push(parsed.error)
    else data.endsAt = parsed.value
  }

  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    errors.push({ field: 'endsAt', message: 'End date must be after start date' })
  }

  if (!partial || body.productIds !== undefined) {
    data._productIdsRaw = Array.isArray(body.productIds) ? body.productIds : []
  }

  return { data, errors }
}

async function resolveOrderedProducts(productIds) {
  const ids = (productIds || []).map(String).filter((id) => isValidObjectId(id))
  if (!ids.length) return []
  const docs = await Product.find({ _id: { $in: ids }, published: { $ne: false } })
  const map = new Map(docs.map((d) => [String(d._id), toClientProduct(d)]))
  return ids.map((id) => map.get(id)).filter(Boolean)
}

function storefrontVisibilityFilter(now = new Date()) {
  return {
    published: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] },
    ],
  }
}

async function adminListCollections(req, res) {
  const q = String(req.query.q || '').trim().toLowerCase()
  const status = String(req.query.status || 'all').toLowerCase()
  const docs = await Collection.find().sort({ sortOrder: 1, name: 1 })
  const now = new Date()
  let rows = docs.map((d) => {
    const json = d.toJSON()
    return { ...json, status: scheduleStatus(json, now), productCount: (json.productIds || []).length }
  })
  if (q) {
    rows = rows.filter(
      (r) =>
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.slug || '').toLowerCase().includes(q) ||
        String(r.description || '').toLowerCase().includes(q)
    )
  }
  if (status !== 'all') {
    rows = rows.filter((r) => r.status === status)
  }
  res.json({ collections: rows })
}

async function adminCreateCollection(req, res) {
  const body = req.body || {}
  const { data, errors } = normalizePayload(body, { partial: false })
  if (errors.length) return res.status(400).json({ message: errors[0].message, errors })

  const unique = await assertUniqueSlug(data.slug)
  if (!unique) {
    return res.status(409).json({
      message: `Slug "${data.slug}" is already in use`,
      errors: [{ field: 'slug', message: 'This slug is already in use' }],
    })
  }

  const productCheck = await validateProductIds(data._productIdsRaw)
  if (productCheck.error) {
    return res.status(400).json({
      message: productCheck.error,
      errors: [{ field: 'productIds', message: productCheck.error }],
    })
  }

  try {
    const doc = await Collection.create({
      name: data.name,
      slug: data.slug,
      heroImage: data.heroImage || '',
      description: data.description || '',
      productIds: productCheck.ids,
      published: data.published === true,
      showOnHomepage: data.published === true,
      sortOrder: data.sortOrder || 0,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      metaTitle: data.metaTitle || '',
      metaDescription: data.metaDescription || '',
    })
    const json = doc.toJSON()
    res.status(201).json({ ...json, status: scheduleStatus(json), productCount: productCheck.ids.length })
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: `Slug "${data.slug}" is already in use`,
        errors: [{ field: 'slug', message: 'This slug is already in use' }],
      })
    }
    throw err
  }
}

async function adminUpdateCollection(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Collection not found' })

  const existing = await Collection.findById(id)
  if (!existing) return res.status(404).json({ message: 'Collection not found' })

  const body = req.body || {}
  const { data, errors } = normalizePayload(body, { partial: true })
  if (errors.length) return res.status(400).json({ message: errors[0].message, errors })

  if (data.slug) {
    const unique = await assertUniqueSlug(data.slug, id)
    if (!unique) {
      return res.status(409).json({
        message: `Slug "${data.slug}" is already in use`,
        errors: [{ field: 'slug', message: 'This slug is already in use' }],
      })
    }
  }

  const updates = { ...data }
  delete updates._productIdsRaw

  if (data._productIdsRaw !== undefined) {
    const productCheck = await validateProductIds(data._productIdsRaw)
    if (productCheck.error) {
      return res.status(400).json({
        message: productCheck.error,
        errors: [{ field: 'productIds', message: productCheck.error }],
      })
    }
    updates.productIds = productCheck.ids
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update' })
  }

  try {
    const doc = await Collection.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
    if (!doc) return res.status(404).json({ message: 'Collection not found' })
    const json = doc.toJSON()
    res.json({
      ...json,
      status: scheduleStatus(json),
      productCount: (json.productIds || []).length,
    })
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: 'Slug is already in use',
        errors: [{ field: 'slug', message: 'This slug is already in use' }],
      })
    }
    throw err
  }
}

async function adminDeleteCollection(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Collection not found' })
  const doc = await Collection.findByIdAndDelete(id)
  if (!doc) return res.status(404).json({ message: 'Collection not found' })

  // Drop from featured list if present
  try {
    const settings = await getOrCreateSettings()
    const before = settings.featuredCollectionIds || []
    const next = before.filter((cid) => String(cid) !== String(id))
    if (next.length !== before.length) {
      settings.featuredCollectionIds = next
      await settings.save()
    }
  } catch {
    /* non-fatal */
  }

  res.status(204).end()
}

async function adminCollectionAnalytics(_req, res) {
  const docs = await Collection.find()
    .select({ name: 1, slug: 1, published: 1, showOnHomepage: 1, viewCount: 1, productIds: 1, startsAt: 1, endsAt: 1 })
    .lean()
  const now = new Date()
  const collections = docs
    .map((d) => ({
      id: String(d._id),
      name: d.name,
      slug: d.slug,
      status: scheduleStatus(d, now),
      showOnHomepage: d.showOnHomepage === true,
      viewCount: Number(d.viewCount) || 0,
      productCount: Array.isArray(d.productIds) ? d.productIds.length : 0,
    }))
    .sort((a, b) => b.viewCount - a.viewCount)

  const totals = {
    collections: collections.length,
    live: collections.filter((c) => c.status === 'live').length,
    draft: collections.filter((c) => c.status === 'draft').length,
    homepage: collections.filter((c) => c.status === 'live').length,
    views: collections.reduce((sum, c) => sum + c.viewCount, 0),
  }

  res.json({ totals, collections })
}

async function publicListCollections(req, res) {
  const now = new Date()
  const q = String(req.query.q || '').trim().toLowerCase()
  const docs = await Collection.find(storefrontVisibilityFilter(now)).sort({ sortOrder: 1, name: 1 })
  let collections = docs.map(publicCollectionSummary)
  if (q) {
    collections = collections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.includes(q) ||
        String(c.description || '').toLowerCase().includes(q)
    )
  }
  res.json({ collections })
}

async function publicGetCollectionBySlug(req, res) {
  const slug = slugify(req.params.slug)
  if (!slug) return res.status(404).json({ message: 'Collection not found' })

  const doc = await Collection.findOne({ slug })
  if (!doc || !isStorefrontVisible(doc)) {
    return res.status(404).json({ message: 'Collection not found' })
  }

  // Fire-and-forget view increment
  Collection.updateOne({ _id: doc._id }, { $inc: { viewCount: 1 } }).catch(() => {})

  const products = await resolveOrderedProducts(doc.productIds)
  const summary = publicCollectionSummary(doc)
  res.json({
    collection: {
      ...summary,
      metaTitle: doc.metaTitle || doc.name,
      metaDescription: doc.metaDescription || doc.description || '',
      products,
    },
  })
}

async function publicFeaturedCollections(_req, res) {
  const now = new Date()
  // Homepage featured rail — max 3 collections at a time.
  const HOME_FEATURED_LIMIT = 3
  const docs = await Collection.find(storefrontVisibilityFilter(now)).sort({ sortOrder: 1, name: 1 })

  if (!docs.length) return res.json({ collections: [] })

  let collections = docs.map(publicCollectionSummary)

  try {
    const settings = await getOrCreateSettings()
    const ids = (settings.featuredCollectionIds || []).map(String).filter((id) => isValidObjectId(id))
    if (ids.length) {
      const map = new Map(collections.map((c) => [c.id, c]))
      const ordered = ids.map((id) => map.get(id)).filter(Boolean)
      const orderedIds = new Set(ordered.map((c) => c.id))
      const rest = collections.filter((c) => !orderedIds.has(c.id))
      collections = [...ordered, ...rest]
    }
  } catch {
    /* keep sortOrder order */
  }

  res.json({ collections: collections.slice(0, HOME_FEATURED_LIMIT) })
}

module.exports = {
  adminListCollections,
  adminCreateCollection,
  adminUpdateCollection,
  adminDeleteCollection,
  adminCollectionAnalytics,
  publicListCollections,
  publicGetCollectionBySlug,
  publicFeaturedCollections,
  slugify,
  isStorefrontVisible,
  storefrontVisibilityFilter,
}
