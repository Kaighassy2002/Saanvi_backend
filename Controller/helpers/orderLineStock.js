const {
  availableUnits,
  recordStockMovement,
  maybeSendReorderAlert,
} = require('./stockInventory')
const {
  sanitizeProductVariants,
  sanitizeVariantList,
  persistSanitizedVariants,
} = require('./productVariantSanitize')
const { Types } = require('mongoose')

function productObjectId(productId) {
  return new Types.ObjectId(String(productId))
}

async function loadPublishedProductLean(Product, productId, session = null) {
  let query = Product.findOne({ _id: productId, published: true }).lean()
  if (session) query = query.session(session)
  return query
}

async function loadProductLean(Product, productId, session = null) {
  let query = Product.findById(productId).lean()
  if (session) query = query.session(session)
  const doc = await query
  return doc ? sanitizeProductVariants(doc) : null
}

/** Lean load + repair corrupt variants in MongoDB before stock operations. */
async function prepareProductForStock(Product, productId, session = null, { publishedOnly = false } = {}) {
  const raw = publishedOnly
    ? await loadPublishedProductLean(Product, productId, session)
    : await (() => {
        let query = Product.findById(productId).lean()
        if (session) query = query.session(session)
        return query
      })()
  if (!raw) return null
  const variants = await persistSanitizedVariants(Product, productId, raw.variants, session)
  return sanitizeProductVariants({ ...raw, variants })
}

const COLOR_ATTR_KEYS = new Set(['color', 'colour', 'stone color', 'stone colour'])
const SIZE_ATTR_KEYS = new Set(['size', 'sizes'])
const VARIANT_KEY_SEP = '::'

function normKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
}

function parseKey(key) {
  const raw = String(key ?? '').trim()
  if (!raw) return { color: '', size: '' }
  const idx = raw.indexOf(VARIANT_KEY_SEP)
  if (idx === -1) return { color: raw, size: '' }
  return { color: raw.slice(0, idx), size: raw.slice(idx + VARIANT_KEY_SEP.length) }
}

function getVariantColor(variant) {
  const attrs = Array.isArray(variant?.attributes) ? variant.attributes : []
  for (const attr of attrs) {
    if (COLOR_ATTR_KEYS.has(normKey(attr?.key))) {
      const value = String(attr?.value || '').trim()
      if (value) return value
    }
  }
  return parseKey(variant?.name).color
}

function getVariantSize(variant) {
  const attrs = Array.isArray(variant?.attributes) ? variant.attributes : []
  for (const attr of attrs) {
    if (SIZE_ATTR_KEYS.has(normKey(attr?.key))) {
      const value = String(attr?.value || '').trim()
      if (value) return value
    }
  }
  return parseKey(variant?.name).size
}

function findVariant(product, variantKey) {
  const key = String(variantKey || '').trim()
  const variants = sanitizeProductVariants(product).variants
  const byName = variants.find((v) => String(v?.name || '').trim() === key)
  if (byName) return byName

  const { color, size } = parseKey(key)
  const c = color.toLowerCase()
  const s = size.toLowerCase()
  return (
    variants.find((v) => {
      const vc = getVariantColor(v).toLowerCase()
      const vs = getVariantSize(v).toLowerCase()
      if (c && vc !== c) return false
      if (s && vs !== s) return false
      if (!s && vs) return false
      return Boolean(c)
    }) || null
  )
}

function resolveLinePricing(product, variant) {
  const basePrice = Math.max(0, Number(product?.price) || 0)
  if (!variant) {
    return {
      unitPrice: basePrice,
      image:
        Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '',
    }
  }
  const variantPrice = Number(variant.price)
  const variantImages = Array.isArray(variant.images) ? variant.images.filter(Boolean) : []
  return {
    unitPrice:
      Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : basePrice,
    image:
      variantImages[0] ||
      (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : ''),
  }
}

function formatOrderItemName(productName, variant) {
  const base = String(productName || '').trim() || 'Product'
  if (!variant) return base
  const label = [getVariantColor(variant), getVariantSize(variant)].filter(Boolean).join(' · ')
  return label ? `${base} — ${label}` : base
}

function getAvailableStock(product, variantKey) {
  const variant = findVariant(product, variantKey)
  if (variant) {
    return availableUnits(variant.stock, variant.reservedStock)
  }
  return availableUnits(product?.stock, product?.reservedStock)
}

function resolveMatchName(product, variantKey) {
  const key = String(variantKey || '').trim()
  const found = findVariant(product, key)
  return found ? String(found.name || '').trim() : key
}

async function reserveParentStock(Product, { productId, quantity }, session, orderId = '') {
  const qty = Number(quantity)
  const opts = session ? { session } : {}
  const updated = await Product.collection.updateOne(
    {
      _id: productObjectId(productId),
      published: true,
      $expr: {
        $gte: [{ $subtract: ['$stock', { $ifNull: ['$reservedStock', 0] }] }, qty],
      },
    },
    { $inc: { reservedStock: qty } },
    opts
  )
  if (!updated.modifiedCount) {
    throw new Error('One or more products are unavailable or out of stock.')
  }
  const product = await loadProductLean(Product, productId, session)
  if (!product) {
    throw new Error('One or more products are unavailable or out of stock.')
  }
  await recordStockMovement({
    productId,
    variantName: '',
    delta: 0,
    movementType: 'reserve',
    reason: `Reserved ${qty} for order`,
    orderId,
    stockAfter: Number(product.stock) || 0,
    reservedAfter: Number(product.reservedStock) || 0,
  })
  await maybeSendReorderAlert(product, '')
  const { unitPrice, image } = resolveLinePricing(product, null)
  return {
    productId: String(productId),
    variantKey: '',
    variantName: '',
    name: product.name || 'Product',
    quantity: qty,
    price: unitPrice,
    image,
    undo: { mode: 'release', productId, quantity: qty, variantKey: '', orderId },
  }
}

async function reserveLine(Product, { productId, quantity, variantKey, variantName }, session, orderId = '') {
  const qty = Number(quantity)
  const key = String(variantKey || variantName || '').trim()

  if (key) {
    const preview = await prepareProductForStock(Product, productId, session, { publishedOnly: true })
    if (!preview) {
      throw new Error('One or more products are unavailable or out of stock.')
    }
    const variant = findVariant(preview, key)
    if (!variant) {
      const hasVariantRows = sanitizeVariantList(preview.variants).length > 0
      if (!hasVariantRows) {
        return reserveParentStock(Product, { productId, quantity: qty }, session, orderId)
      }
      throw new Error('One or more products are unavailable or out of stock.')
    }
    const matchName = String(variant.name || '').trim()
    if (availableUnits(variant.stock, variant.reservedStock) < qty) {
      throw new Error('One or more products are unavailable or out of stock.')
    }
    const opts = {
      arrayFilters: [{ 'elem.name': matchName }],
      ...(session ? { session } : {}),
    }
    const result = await Product.collection.updateOne(
      { _id: productObjectId(productId), published: true, 'variants.name': matchName },
      { $inc: { 'variants.$[elem].reservedStock': qty } },
      opts
    )
    if (!result.modifiedCount) {
      throw new Error('One or more products are unavailable or out of stock.')
    }
    const product = await loadProductLean(Product, productId, session)
    const freshVariant = findVariant(product, key)
    const stockAfter = Number(freshVariant?.stock) || 0
    const reservedAfter = Number(freshVariant?.reservedStock) || 0
    await recordStockMovement({
      productId,
      variantName: matchName,
      delta: 0,
      movementType: 'reserve',
      reason: `Reserved ${qty} for order`,
      orderId,
      stockAfter,
      reservedAfter,
    })
    await maybeSendReorderAlert(product, matchName)
    const { unitPrice, image } = resolveLinePricing(product, freshVariant)
    return {
      productId: String(productId),
      variantKey: matchName,
      variantName: matchName,
      name: formatOrderItemName(product.name, freshVariant),
      quantity: qty,
      price: unitPrice,
      image,
      undo: { mode: 'release', productId, quantity: qty, variantKey: matchName, orderId },
    }
  }

  return reserveParentStock(Product, { productId, quantity: qty }, session, orderId)
}

async function releaseReservation(Product, { productId, quantity, variantKey, variantName, orderId = '' }, session) {
  const qty = Number(quantity)
  const key = String(variantKey || variantName || '').trim()
  const opts = session ? { session } : {}
  if (key) {
    const product = await prepareProductForStock(Product, productId, session)
    const matchName = resolveMatchName(product, key)
    await Product.collection.updateOne(
      { _id: productObjectId(productId), 'variants.name': matchName },
      { $inc: { 'variants.$[elem].reservedStock': -qty } },
      { arrayFilters: [{ 'elem.name': matchName }], ...opts }
    )
    const fresh = await loadProductLean(Product, productId, session)
    const v = findVariant(fresh, key)
    await recordStockMovement({
      productId,
      variantName: matchName,
      delta: 0,
      movementType: 'release',
      reason: `Released reservation (${qty})`,
      orderId,
      stockAfter: Number(v?.stock) || 0,
      reservedAfter: Math.max(0, Number(v?.reservedStock) || 0),
    })
    return
  }
  await Product.collection.updateOne(
    { _id: productObjectId(productId) },
    { $inc: { reservedStock: -qty } },
    opts
  )
  const fresh = await loadProductLean(Product, productId, session)
  await recordStockMovement({
    productId,
    variantName: '',
    delta: 0,
    movementType: 'release',
    reason: `Released reservation (${qty})`,
    orderId,
    stockAfter: Number(fresh?.stock) || 0,
    reservedAfter: Math.max(0, Number(fresh?.reservedStock) || 0),
  })
}

async function commitReservation(Product, { productId, quantity, variantKey, variantName, orderId = '' }, session) {
  const qty = Number(quantity)
  const key = String(variantKey || variantName || '').trim()
  const opts = session ? { session } : {}
  if (key) {
    const product = await prepareProductForStock(Product, productId, session)
    const matchName = resolveMatchName(product, key)
    await Product.collection.updateOne(
      { _id: productObjectId(productId), 'variants.name': matchName },
      {
        $inc: {
          'variants.$[elem].stock': -qty,
          'variants.$[elem].reservedStock': -qty,
        },
      },
      { arrayFilters: [{ 'elem.name': matchName }], ...opts }
    )
    const fresh = await loadProductLean(Product, productId, session)
    const v = findVariant(fresh, key)
    await recordStockMovement({
      productId,
      variantName: matchName,
      delta: -qty,
      movementType: 'sale',
      reason: `Committed sale (${qty})`,
      orderId,
      stockAfter: Number(v?.stock) || 0,
      reservedAfter: Math.max(0, Number(v?.reservedStock) || 0),
    })
    await maybeSendReorderAlert(fresh, matchName)
    return
  }
  await Product.collection.updateOne(
    { _id: productObjectId(productId) },
    { $inc: { stock: -qty, reservedStock: -qty } },
    opts
  )
  const fresh = await loadProductLean(Product, productId, session)
  await recordStockMovement({
    productId,
    variantName: '',
    delta: -qty,
    movementType: 'sale',
    reason: `Committed sale (${qty})`,
    orderId,
    stockAfter: Number(fresh?.stock) || 0,
    reservedAfter: Math.max(0, Number(fresh?.reservedStock) || 0),
  })
  await maybeSendReorderAlert(fresh, '')
}

async function restockCommittedLine(Product, { productId, quantity, variantKey, variantName, orderId = '' }, session) {
  const qty = Number(quantity)
  const key = String(variantKey || variantName || '').trim()
  const opts = session ? { session } : {}
  if (key) {
    const product = await prepareProductForStock(Product, productId, session)
    const matchName = resolveMatchName(product, key)
    await Product.collection.updateOne(
      { _id: productObjectId(productId), 'variants.name': matchName },
      { $inc: { 'variants.$[elem].stock': qty } },
      { arrayFilters: [{ 'elem.name': matchName }], ...opts }
    )
    const fresh = await loadProductLean(Product, productId, session)
    const v = findVariant(fresh, key)
    await recordStockMovement({
      productId,
      variantName: matchName,
      delta: qty,
      movementType: 'restock',
      reason: `Restocked ${qty} from order`,
      orderId,
      stockAfter: Number(v?.stock) || 0,
      reservedAfter: Number(v?.reservedStock) || 0,
    })
    return
  }
  await Product.collection.updateOne(
    { _id: productObjectId(productId) },
    { $inc: { stock: qty } },
    opts
  )
  const fresh = await loadProductLean(Product, productId, session)
  await recordStockMovement({
    productId,
    variantName: '',
    delta: qty,
    movementType: 'restock',
    reason: `Restocked ${qty} from order`,
    orderId,
    stockAfter: Number(fresh?.stock) || 0,
    reservedAfter: Number(fresh?.reservedStock) || 0,
  })
}

/**
 * @param {import('mongoose').Model} Product
 * @param {{ productId: string, quantity: number, variantName?: string, variantKey?: string, name?: string }} line
 * @param {{ session?: import('mongoose').ClientSession, decrement?: boolean, orderId?: string }} opts
 */
async function resolveAndMaybeDecrementLine(Product, line, opts = {}) {
  const { session, decrement = false, orderId = '' } = opts
  const quantity = Number(line.quantity)
  const productId = String(line.productId)
  const variantKey = String(line.variantKey || line.variantName || '').trim()

  if (decrement) {
    return reserveLine(
      Product,
      {
        productId,
        quantity,
        variantKey,
        variantName: variantKey,
        name: line.name,
      },
      session,
      orderId
    )
  }

  let stockQuery = Product.findOne({ _id: productId, published: true }).lean()
  if (session) stockQuery = stockQuery.session(session)
  const product = await stockQuery
  if (!product) {
    throw new Error('One or more products are unavailable.')
  }
  const sanitizedVariants = await persistSanitizedVariants(Product, productId, product.variants, session)
  const safeProduct = sanitizeProductVariants({ ...product, variants: sanitizedVariants })
  const stock = getAvailableStock(safeProduct, variantKey)
  if (stock < quantity) {
    throw new Error('One or more products are unavailable or out of stock.')
  }
  const variant = findVariant(safeProduct, variantKey)
  const { unitPrice, image } = resolveLinePricing(safeProduct, variant)
  const matchName = variant ? String(variant.name || '').trim() : variantKey
  return {
    productId,
    variantKey: matchName,
    variantName: matchName,
    name: formatOrderItemName(safeProduct.name, variant),
    quantity,
    price: unitPrice,
    image,
    undo: null,
  }
}

async function undoInventoryLine(Product, undo, session) {
  if (!undo) return
  if (undo.mode === 'release') {
    await releaseReservation(Product, undo, session)
    return
  }
  if (undo.mode === 'restock') {
    await restockCommittedLine(Product, undo, session)
  }
}

async function restockOrderItems(Product, items, session = null, orderId = '', stockCommitted = false) {
  for (const item of items || []) {
    const row = {
      productId: item.productId,
      quantity: item.quantity,
      variantKey: item.variantName || item.variantKey || '',
      orderId,
    }
    if (stockCommitted) {
      await restockCommittedLine(Product, row, session)
    } else {
      await releaseReservation(Product, row, session)
    }
  }
}

async function commitOrderItems(Product, items, session = null, orderId = '') {
  for (const item of items || []) {
    await commitReservation(
      Product,
      {
        productId: item.productId,
        quantity: item.quantity,
        variantKey: item.variantName || item.variantKey || '',
        orderId,
      },
      session
    )
  }
}

/** @deprecated use undoInventoryLine */
async function restockLine(Product, row, session) {
  await restockCommittedLine(
    Product,
    {
      productId: row.productId,
      quantity: row.quantity,
      variantKey: row.variantKey || row.variantName || '',
    },
    session
  )
}

module.exports = {
  resolveAndMaybeDecrementLine,
  restockLine,
  restockOrderItems,
  commitOrderItems,
  releaseReservation,
  commitReservation,
  restockCommittedLine,
  undoInventoryLine,
  getAvailableStock,
  findVariant,
}
