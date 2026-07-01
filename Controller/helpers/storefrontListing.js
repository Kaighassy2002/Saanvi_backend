const Product = require('../../Models/Product')
const toClientProduct = Product.toClientProduct
const { getOrCreateSettings } = require('./siteSettings')
const { publishDueProducts } = require('./scheduledPublish')
const { availableUnits } = require('./stockInventory')

const VARIANT_KEY_SEP = '::'
const COLOR_ATTR_KEYS = new Set(['color', 'colour', 'stone color', 'stone colour'])

const COMMON_FILTER_COLORS = [
  'Gold', 'Rose Gold', 'Silver', 'Red', 'Green', 'Blue', 'White', 'Purple', 'Pink', 'Black', 'Brown', 'Multicolor',
]
const BASIC_MATERIALS = ['Gold', 'Silver', 'Rose Gold', 'Platinum', 'Brass']

const COLOR_ALIASES = [
  ['antique gold', 'Gold'], ['rose gold', 'Rose Gold'], ['white gold', 'Gold'], ['yellow gold', 'Gold'],
  ['ruby red', 'Red'], ['sterling silver', 'Silver'], ['multicolour', 'Multicolor'], ['multicolor', 'Multicolor'],
  ['meenakari', 'Multicolor'], ['emerald', 'Green'], ['sapphire', 'Blue'], ['maroon', 'Red'], ['gold', 'Gold'],
  ['silver', 'Silver'], ['ruby', 'Red'], ['pearl', 'White'], ['diamond', 'White'], ['purple', 'Purple'],
  ['green', 'Green'], ['blue', 'Blue'], ['red', 'Red'], ['pink', 'Pink'], ['white', 'White'], ['black', 'Black'],
  ['brown', 'Brown'], ['orange', 'Red'],
]

const MATERIAL_ALIASES = [
  ['sterling silver', 'Silver'], ['925 silver', 'Silver'], ['silver', 'Silver'], ['rose gold', 'Rose Gold'],
  ['white gold', 'Gold'], ['yellow gold', 'Gold'], ['gold', 'Gold'], ['platinum', 'Platinum'], ['brass', 'Brass'],
]

let publishedCache = null
let publishedCacheAt = 0
const CACHE_MS = 60_000

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

async function loadPublishedProducts() {
  const now = Date.now()
  if (publishedCache && now - publishedCacheAt < CACHE_MS) return publishedCache
  await publishDueProducts()
  const docs = await Product.find({ published: true }).lean()
  publishedCache = docs.map((d) => toStorefrontProduct(toClientProduct(d)))
  publishedCacheAt = now
  return publishedCache
}

function invalidatePublishedCache() {
  publishedCache = null
  publishedCacheAt = 0
}

function normKey(key) {
  return String(key || '').trim().toLowerCase()
}

function productHasVariants(product) {
  return Array.isArray(product?.variants) && product.variants.length > 0
}

function getProductVariants(product) {
  return Array.isArray(product?.variants) ? product.variants : []
}

function getVariantColor(variant) {
  const attrs = Array.isArray(variant?.attributes) ? variant.attributes : []
  for (const attr of attrs) {
    if (COLOR_ATTR_KEYS.has(normKey(attr?.key))) {
      const value = String(attr?.value || '').trim()
      if (value) return value
    }
  }
  const raw = String(variant?.name || '').trim()
  const idx = raw.indexOf(VARIANT_KEY_SEP)
  return idx === -1 ? raw : raw.slice(0, idx)
}

function productIsInStock(product) {
  if (productHasVariants(product)) {
    return getProductVariants(product).some((v) => availableUnits(v?.stock, v?.reservedStock) > 0)
  }
  return availableUnits(product?.stock, product?.reservedStock) > 0
}

function productMatchesSearch(product, term) {
  const t = String(term || '').trim().toLowerCase()
  if (!t) return true
  const name = String(product.name || '').toLowerCase()
  const category = String(product.category || '').toLowerCase()
  const description = String(product.description || '').toLowerCase()
  return name.includes(t) || category.includes(t) || description.includes(t)
}

function matchKeyword(text, keyword) {
  if (keyword.includes(' ')) return text.includes(keyword)
  return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
}

function inferFromKeywords(text, keywords) {
  const lower = String(text || '').toLowerCase()
  for (const [keyword, label] of keywords) {
    if (matchKeyword(lower, keyword)) return label
  }
  return ''
}

function getProductMaterial(product) {
  const stored = String(product?.specifications?.material || product?.material || '').trim()
  if (stored) {
    const exact = BASIC_MATERIALS.find((m) => m.toLowerCase() === stored.toLowerCase())
    if (exact) return exact
    const inferred = inferFromKeywords(stored, MATERIAL_ALIASES)
    if (inferred) return inferred
  }
  return inferFromKeywords(`${product?.name || ''} ${product?.description || ''}`, MATERIAL_ALIASES)
}

function normalizeColorToken(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const exact = COMMON_FILTER_COLORS.find((c) => c.toLowerCase() === text.toLowerCase())
  if (exact) return exact
  const inferred = inferFromKeywords(text, COLOR_ALIASES)
  if (inferred && COMMON_FILTER_COLORS.includes(inferred)) return inferred
  const titled = text.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  if (COMMON_FILTER_COLORS.includes(titled)) return titled
  return ''
}

function getProductColorLabels(product) {
  const rawLabels = []
  for (const variant of getProductVariants(product)) {
    const color = getVariantColor(variant)
    if (color) rawLabels.push(color)
  }
  if (rawLabels.length === 0) {
    const stored = String(product?.specifications?.color || product?.color || '').trim()
    if (stored) rawLabels.push(stored)
    else {
      const inferred = inferFromKeywords(`${product?.name || ''} ${product?.description || ''}`, COLOR_ALIASES)
      if (inferred) rawLabels.push(inferred)
    }
  }
  const normalized = new Set()
  for (const raw of rawLabels) {
    for (const token of String(raw).split(/[,/&]|(?:\s+and\s+)/i).map((s) => s.trim()).filter(Boolean)) {
      const color = normalizeColorToken(token)
      if (color) normalized.add(color)
    }
  }
  return [...normalized]
}

function productMatchesColorFacet(product, selectedColors) {
  if (!selectedColors.length) return true
  const labels = getProductColorLabels(product).map((v) => v.toLowerCase())
  if (!labels.length) return false
  return selectedColors.some((s) => labels.includes(String(s).toLowerCase()))
}

function productMatchesMaterialFacet(product, selectedMaterials) {
  if (!selectedMaterials.length) return true
  const material = getProductMaterial(product)
  if (!material) return false
  const norm = material.toLowerCase()
  return selectedMaterials.some((s) => s.toLowerCase() === norm)
}

function getColorVariantOptions(product) {
  const byColor = new Map()
  for (const variant of getProductVariants(product)) {
    const color = getVariantColor(variant)
    if (!color) continue
    const stock = availableUnits(variant?.stock, variant?.reservedStock)
    const variantImages = Array.isArray(variant?.images) ? variant.images.filter(Boolean) : []
    const productImages = Array.isArray(product?.images) ? product.images.filter(Boolean) : []
    if (!byColor.has(color)) {
      byColor.set(color, {
        color,
        variantName: color,
        label: color,
        stock: 0,
        image: variantImages[0] || productImages[0] || product?.image || '',
        images: variantImages.length > 0 ? variantImages : productImages,
      })
    }
    const row = byColor.get(color)
    row.stock += stock
    if (variantImages.length > 0 && !row.image) {
      row.image = variantImages[0]
      row.images = variantImages
    }
  }
  return [...byColor.values()]
}

function resolveProductLine(product, color = '') {
  const basePrice = Math.max(0, Number(product?.price) || 0)
  const baseStock = availableUnits(product?.stock, product?.reservedStock)
  const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : []
  const baseImage = images[0] || product?.image || ''
  if (!productHasVariants(product)) {
    return { price: basePrice, stock: baseStock, image: baseImage, images }
  }
  const variant = getProductVariants(product).find((v) => getVariantColor(v) === color)
  if (!variant) return { price: basePrice, stock: 0, image: baseImage, images }
  const variantPrice = Number(variant.price)
  const variantImages = Array.isArray(variant.images) ? variant.images.filter(Boolean) : []
  const gallery = variantImages.length > 0 ? variantImages : images
  return {
    price: Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : basePrice,
    stock: availableUnits(variant.stock, variant.reservedStock),
    image: variantImages[0] || baseImage,
    images: gallery,
  }
}

function expandProductsForCollectionListing(products) {
  return products.flatMap((product) => {
    const colorOptions = getColorVariantOptions(product).sort((a, b) =>
      String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' })
    )
    if (colorOptions.length <= 1) {
      return [{
        key: String(product.id),
        productId: product.id,
        displayProduct: product,
        colorLabel: '',
        href: `/product/${product.id}`,
      }]
    }
    return colorOptions.map((option) => {
      const line = resolveProductLine(product, option.color)
      const variantImages = Array.isArray(option.images) && option.images.length > 0 ? option.images : product.images
      const image = option.image || variantImages?.[0] || product.image
      const params = new URLSearchParams({ color: option.color || option.variantName })
      return {
        key: `${product.id}::${option.variantName}`,
        productId: product.id,
        displayProduct: {
          ...product,
          variants: [],
          image,
          images: Array.isArray(variantImages) ? variantImages : product.images,
          price: line.price,
          stock: option.stock,
        },
        colorLabel: option.label,
        href: `/product/${product.id}?${params.toString()}`,
      }
    })
  })
}

function getProductRecencyMs(product) {
  for (const field of ['createdAt', 'updatedAt']) {
    const raw = product?.[field]
    if (!raw) continue
    const t = new Date(raw).getTime()
    if (Number.isFinite(t)) return t
  }
  const id = String(product?.id || '')
  if (/^[a-f0-9]{24}$/i.test(id)) return parseInt(id.slice(0, 8), 16) * 1000
  return 0
}

function getDiscountRatio(product) {
  const price = Number(product?.price) || 0
  const original = Number(product?.originalPrice) || 0
  if (original > price && original > 0) return (original - price) / original
  return 0
}

function getDailyBrowseSeed() {
  const now = new Date()
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
}

function seededShuffle(items, seed) {
  const list = [...items]
  let state = seed >>> 0
  for (let i = list.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

function mixSortedProductsForBrowse(products, featuredProductIds = []) {
  const pinnedIds = new Set((featuredProductIds || []).map(String).filter(Boolean))
  const pinned = []
  const rest = []
  for (const product of products) {
    if (pinnedIds.has(String(product.id))) pinned.push(product)
    else rest.push(product)
  }
  if (rest.length <= 1) return [...pinned, ...rest]
  return [...pinned, ...seededShuffle(rest, getDailyBrowseSeed())]
}

function sortProductsForCollection(products, sortBy, { featuredProductIds = [] } = {}) {
  const copy = [...products]
  const compareNames = (a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })

  if (sortBy === 'name') return copy.sort(compareNames)
  if (sortBy === 'latest') {
    return copy.sort((a, b) => getProductRecencyMs(b) - getProductRecencyMs(a) || compareNames(a, b))
  }
  if (sortBy === 'discount') {
    return copy.sort(
      (a, b) =>
        getDiscountRatio(b) - getDiscountRatio(a) ||
        getProductRecencyMs(b) - getProductRecencyMs(a) ||
        compareNames(a, b)
    )
  }
  if (sortBy === 'price-low' || sortBy === 'price-high') return copy

  const featuredRank = new Map(
    (featuredProductIds || []).map(String).filter(Boolean).map((id, index) => [id, index])
  )
  return copy.sort((a, b) => {
    const ra = featuredRank.has(String(a.id)) ? featuredRank.get(String(a.id)) : Number.MAX_SAFE_INTEGER
    const rb = featuredRank.has(String(b.id)) ? featuredRank.get(String(b.id)) : Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    const fa = a.featured ? 0 : 1
    const fb = b.featured ? 0 : 1
    if (fa !== fb) return fa - fb
    const sa = productIsInStock(a) ? 0 : 1
    const sb = productIsInStock(b) ? 0 : 1
    if (sa !== sb) return sa - sb
    return getProductRecencyMs(b) - getProductRecencyMs(a) || compareNames(a, b)
  })
}

function sortListingEntries(entries, sortBy) {
  if (sortBy !== 'price-low' && sortBy !== 'price-high' && sortBy !== 'discount') return entries
  const copy = [...entries]
  const compareEntries = (a, b) => {
    const nameCmp = String(a.displayProduct?.name || '').localeCompare(
      String(b.displayProduct?.name || ''),
      undefined,
      { sensitivity: 'base' }
    )
    if (nameCmp !== 0) return nameCmp
    return String(a.colorLabel || '').localeCompare(String(b.colorLabel || ''), undefined, {
      sensitivity: 'base',
    })
  }
  if (sortBy === 'price-low') {
    return copy.sort(
      (a, b) =>
        (Number(a.displayProduct?.price) || 0) - (Number(b.displayProduct?.price) || 0) || compareEntries(a, b)
    )
  }
  if (sortBy === 'price-high') {
    return copy.sort(
      (a, b) =>
        (Number(b.displayProduct?.price) || 0) - (Number(a.displayProduct?.price) || 0) || compareEntries(a, b)
    )
  }
  return copy.sort(
    (a, b) =>
      getDiscountRatio(b.displayProduct) - getDiscountRatio(a.displayProduct) || compareEntries(a, b)
  )
}

function interleaveListingEntries(entries) {
  if (entries.length <= 1) return entries
  const groups = new Map()
  const groupOrder = []
  for (const entry of entries) {
    const id = String(entry.productId)
    if (!groups.has(id)) {
      groups.set(id, [])
      groupOrder.push(id)
    }
    groups.get(id).push(entry)
  }
  if (groupOrder.length <= 1) return entries
  const mixed = []
  let remaining = entries.length
  while (remaining > 0) {
    for (const id of groupOrder) {
      const queue = groups.get(id)
      if (!queue?.length) continue
      mixed.push(queue.shift())
      remaining -= 1
    }
  }
  return mixed
}

function buildCollectionListing(products, sortBy, { featuredProductIds = [] } = {}) {
  const postExpandSorts = new Set(['price-low', 'price-high', 'discount'])
  const postExpandMixSorts = new Set(['featured', 'latest'])

  if (postExpandSorts.has(sortBy)) {
    const entries = expandProductsForCollectionListing(products)
    return sortListingEntries(entries, sortBy)
  }

  let sorted = sortProductsForCollection(products, sortBy, { featuredProductIds })
  if (sortBy === 'featured') sorted = mixSortedProductsForBrowse(sorted, featuredProductIds)

  let entries = expandProductsForCollectionListing(sorted)
  if (postExpandMixSorts.has(sortBy)) entries = interleaveListingEntries(entries)
  return sortListingEntries(entries, sortBy)
}

function filterProducts(products, query) {
  const category = String(query.category || '').trim()
  const search = String(query.search || '').trim()
  const stock = query.stock || 'all'
  const min = query.min != null && query.min !== '' ? Number(query.min) : null
  const max = query.max != null && query.max !== '' ? Number(query.max) : null
  const colors = Array.isArray(query.colors) ? query.colors : []
  const materials = Array.isArray(query.materials) ? query.materials : []

  return products.filter((product) => {
    const categoryMatch = !category || category === 'All' || product.category === category
    if (!categoryMatch || !productMatchesSearch(product, search)) return false
    const inStock = productIsInStock(product)
    if (stock === 'in-stock' && !inStock) return false
    if (stock === 'out-stock' && inStock) return false
    const price = Number(product.price) || 0
    if (min != null && Number.isFinite(min) && price < min) return false
    if (max != null && Number.isFinite(max) && price > max) return false
    if (!productMatchesColorFacet(product, colors)) return false
    if (!productMatchesMaterialFacet(product, materials)) return false
    return true
  })
}

function buildFacets(products, adminCategories = []) {
  const prices = products.map((p) => Number(p.price) || 0)
  const priceBounds = {
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0,
  }

  const categoryCounts = { All: products.length }
  for (const product of products) {
    const key = product.category || 'Uncategorized'
    categoryCounts[key] = (categoryCounts[key] || 0) + 1
  }

  const fromProducts = [...new Set(products.map((p) => p.category).filter(Boolean))]
  const merged = [...new Set([...adminCategories, ...fromProducts])].sort((a, b) => a.localeCompare(b))
  const categories = ['All', ...merged]

  const inStockCount = products.filter((p) => productIsInStock(p)).length

  const colorCounts = Object.fromEntries(COMMON_FILTER_COLORS.map((c) => [c, 0]))
  for (const product of products) {
    for (const value of getProductColorLabels(product)) {
      if (colorCounts[value] != null) colorCounts[value] += 1
    }
  }
  const colorOptions = COMMON_FILTER_COLORS.map((value) => ({ value, count: colorCounts[value] })).filter(
    (o) => o.count > 0
  )

  const materialCounts = Object.fromEntries(BASIC_MATERIALS.map((m) => [m, 0]))
  for (const product of products) {
    const material = getProductMaterial(product)
    if (material && materialCounts[material] != null) materialCounts[material] += 1
  }
  const materialOptions = BASIC_MATERIALS.map((value) => ({ value, count: materialCounts[value] })).filter(
    (o) => o.count > 0
  )

  return {
    priceBounds,
    categoryCounts,
    categories,
    inStockCount,
    outOfStockCount: products.length - inStockCount,
    colorOptions,
    materialOptions,
    productsCount: products.length,
  }
}

function parseListingQuery(query) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const limit = Math.min(48, Math.max(1, parseInt(String(query.limit || '16'), 10) || 16))
  const category = String(query.category || '').trim()
  const search = String(query.search || '').trim()
  const sortValues = ['featured', 'latest', 'discount', 'price-low', 'price-high', 'name']
  const sort = sortValues.includes(query.sort) ? query.sort : 'featured'
  const stockValues = ['all', 'in-stock', 'out-stock']
  const stock = stockValues.includes(query.stock) ? query.stock : 'all'
  const min = query.min != null && query.min !== '' ? Number(query.min) : null
  const max = query.max != null && query.max !== '' ? Number(query.max) : null
  const colors = String(query.color || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const materials = String(query.material || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return { page, limit, category, search, sort, stock, min, max, colors, materials }
}

async function getStorefrontListing(query) {
  const params = parseListingQuery(query)
  const [products, settings] = await Promise.all([loadPublishedProducts(), getOrCreateSettings()])
  const facets = buildFacets(products, settings.categories || [])
  const filtered = filterProducts(products, params)
  const featuredProductIds = settings.featuredProductIds || []
  const allEntries = buildCollectionListing(filtered, params.sort, { featuredProductIds })
  const total = allEntries.length
  const pages = Math.max(1, Math.ceil(total / params.limit) || 1)
  const skip = (params.page - 1) * params.limit
  const entries = allEntries.slice(skip, skip + params.limit)

  return {
    entries,
    total,
    page: params.page,
    limit: params.limit,
    pages,
    facets,
  }
}

function parseDiscoveryLimit(raw, fallback = 10, max = 24) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), max)
}

async function searchPublishedCatalog(query, limit = 6) {
  const q = String(query || '').trim()
  if (!q) return { products: [], categories: [] }
  const [products, settings] = await Promise.all([loadPublishedProducts(), getOrCreateSettings()])
  const matched = products.filter((p) => productMatchesSearch(p, q)).slice(0, limit)
  const ql = q.toLowerCase()
  const categorySet = new Set()
  for (const product of products) {
    const cat = product.category
    if (cat && String(cat).toLowerCase().includes(ql)) categorySet.add(cat)
  }
  for (const cat of settings.categories || []) {
    if (String(cat).toLowerCase().includes(ql)) categorySet.add(cat)
  }
  const categories = [...categorySet].slice(0, 4).map((name) => ({
    name,
    href: `/collections?category=${encodeURIComponent(name)}`,
  }))
  return { products: matched, categories }
}

async function getFeaturedPublishedProducts(limit = 10) {
  const [products, settings] = await Promise.all([loadPublishedProducts(), getOrCreateSettings()])
  const ids = (settings.featuredProductIds || []).map(String).filter(Boolean)
  if (ids.length) {
    const byId = new Map(products.map((p) => [String(p.id), p]))
    const picked = ids.map((id) => byId.get(id)).filter(Boolean)
    if (picked.length) return picked.slice(0, limit)
  }
  return products.filter(productIsInStock).slice(0, limit)
}

async function getBestSellerPublishedProducts(limit = 10) {
  const products = await loadPublishedProducts()
  return [...products]
    .filter(productIsInStock)
    .sort(
      (a, b) =>
        getDiscountRatio(b) - getDiscountRatio(a) ||
        getProductRecencyMs(b) - getProductRecencyMs(a)
    )
    .slice(0, limit)
}

async function getRelatedPublishedProducts(productId, limit = 4) {
  const products = await loadPublishedProducts()
  const id = String(productId || '')
  const current = products.find((p) => String(p.id) === id)
  if (!current) return []
  const category = String(current.category || '').trim()
  const sameCategory = products.filter(
    (p) =>
      String(p.id) !== id &&
      productIsInStock(p) &&
      (category ? p.category === category : true)
  )
  const pool =
    sameCategory.length > 0
      ? sameCategory
      : products.filter((p) => String(p.id) !== id && productIsInStock(p))
  return pool.slice(0, limit)
}

module.exports = {
  getStorefrontListing,
  parseListingQuery,
  invalidatePublishedCache,
  loadPublishedProducts,
  parseDiscoveryLimit,
  searchPublishedCatalog,
  getFeaturedPublishedProducts,
  getBestSellerPublishedProducts,
  getRelatedPublishedProducts,
}
