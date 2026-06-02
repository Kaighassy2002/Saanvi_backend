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
  const variants = Array.isArray(product?.variants) ? product.variants : []
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
  if (variant) return Math.max(0, Number(variant.stock) || 0)
  return Math.max(0, Number(product?.stock) || 0)
}

/**
 * @param {import('mongoose').Model} Product
 * @param {{ productId: string, quantity: number, variantName?: string, variantKey?: string, name?: string }} line
 * @param {{ session?: import('mongoose').ClientSession, decrement?: boolean }} opts
 */
async function resolveAndMaybeDecrementLine(Product, line, opts = {}) {
  const { session, decrement = false } = opts
  const quantity = Number(line.quantity)
  const productId = String(line.productId)
  const variantKey = String(line.variantKey || line.variantName || '').trim()

  if (decrement) {
    if (variantKey) {
      let matchName = variantKey
      const preview = await Product.findOne({ _id: productId, published: true }).lean()
      const found = findVariant(preview, variantKey)
      if (found) matchName = String(found.name || '').trim()

      const product = await Product.findOneAndUpdate(
        {
          _id: productId,
          published: true,
          variants: {
            $elemMatch: { name: matchName, stock: { $gte: quantity } },
          },
        },
        { $inc: { 'variants.$.stock': -quantity } },
        { new: true, session }
      )
      if (!product) {
        throw new Error('One or more products are unavailable or out of stock.')
      }
      const freshVariant = findVariant(product, variantKey)
      const { unitPrice, image } = resolveLinePricing(product, freshVariant)
      return {
        productId,
        variantKey: matchName,
        variantName: matchName,
        name: formatOrderItemName(product.name, freshVariant),
        quantity,
        price: unitPrice,
        image,
        restock: { productId, quantity, variantKey: matchName },
      }
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: productId,
        published: true,
        stock: { $gte: quantity },
      },
      { $inc: { stock: -quantity } },
      { new: true, session }
    )
    if (!product) {
      throw new Error('One or more products are unavailable or out of stock.')
    }
    const { unitPrice, image } = resolveLinePricing(product, null)
    return {
      productId,
      variantKey: '',
      variantName: '',
      name: product.name || String(line.name || '').trim() || 'Product',
      quantity,
      price: unitPrice,
      image,
      restock: { productId, quantity, variantKey: '' },
    }
  }

  let stockQuery = Product.findOne({ _id: productId, published: true })
  if (session) stockQuery = stockQuery.session(session)
  const product = await stockQuery.lean()
  if (!product) {
    throw new Error('One or more products are unavailable.')
  }
  const stock = getAvailableStock(product, variantKey)
  if (stock < quantity) {
    throw new Error('One or more products are unavailable or out of stock.')
  }
  const variant = findVariant(product, variantKey)
  const { unitPrice, image } = resolveLinePricing(product, variant)
  const matchName = variant ? String(variant.name || '').trim() : variantKey
  return {
    productId,
    variantKey: matchName,
    variantName: matchName,
    name: formatOrderItemName(product.name, variant),
    quantity,
    price: unitPrice,
    image,
    restock: null,
  }
}

async function restockLine(Product, { productId, quantity, variantKey, variantName }, session) {
  const key = String(variantKey || variantName || '').trim()
  if (key) {
    const product = await Product.findOne({ _id: productId }).lean()
    const variant = findVariant(product, key)
    const matchName = variant ? String(variant.name || '').trim() : key
    await Product.updateOne(
      { _id: productId, 'variants.name': matchName },
      { $inc: { 'variants.$.stock': Number(quantity) } },
      { session }
    )
    return
  }
  await Product.updateOne(
    { _id: productId },
    { $inc: { stock: Number(quantity) } },
    { session }
  )
}

module.exports = {
  resolveAndMaybeDecrementLine,
  restockLine,
  getAvailableStock,
}
