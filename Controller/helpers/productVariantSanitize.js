function normalizeCertification(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    bisHallmark: !!c.bisHallmark,
    bisLicense: String(c.bisLicense || '').trim(),
    diamondCertUrl: String(c.diamondCertUrl || '').trim(),
    diamondCertNumber: String(c.diamondCertNumber || '').trim(),
  }
}

function isVariantObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** Drop corrupt variant entries (e.g. bare numbers) and normalize fields. */
function sanitizeVariantList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(isVariantObject).map((v) => ({
    name: String(v.name || '').trim(),
    sku: String(v.sku || '').trim(),
    price: Number(v.price) || 0,
    stock: Math.max(0, Number(v.stock) || 0),
    reservedStock: Math.max(0, Number(v.reservedStock) || 0),
    images: Array.isArray(v.images) ? v.images.map((u) => String(u || '').trim()).filter(Boolean) : [],
    attributes: Array.isArray(v.attributes)
      ? v.attributes
          .filter(isVariantObject)
          .map((a) => ({
            key: String(a.key || '').trim(),
            value: String(a.value || '').trim(),
          }))
          .filter((a) => a.key)
      : [],
    certification: normalizeCertification(v.certification),
  }))
}

function sanitizeProductVariants(product) {
  if (!product || typeof product !== 'object') return product
  return {
    ...product,
    variants: sanitizeVariantList(product.variants),
  }
}

/** True when MongoDB variants are not a valid variant object array (e.g. scalar 1 or [1]). */
function variantsFieldNeedsRepair(raw) {
  if (raw == null) return false
  if (!Array.isArray(raw)) return true
  return raw.some((entry) => !isVariantObject(entry))
}

/**
 * Persist sanitized variants via the native driver (avoids Mongoose cast on corrupt data).
 * @returns {object[]} sanitized variant rows written (or that would be written)
 */
async function persistSanitizedVariants(Product, productId, rawVariants, session = null) {
  const sanitized = sanitizeVariantList(rawVariants)
  if (!variantsFieldNeedsRepair(rawVariants)) {
    return sanitized
  }
  const { Types } = require('mongoose')
  const opts = session ? { session } : {}
  await Product.collection.updateOne(
    { _id: new Types.ObjectId(String(productId)) },
    { $set: { variants: sanitized } },
    opts
  )
  return sanitized
}

module.exports = {
  isVariantObject,
  sanitizeVariantList,
  sanitizeProductVariants,
  variantsFieldNeedsRepair,
  persistSanitizedVariants,
  normalizeCertification,
}
