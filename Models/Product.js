const mongoose = require('mongoose')

const specificationsSchema = new mongoose.Schema(
  {
    material: { type: String, default: '' },
    color: { type: String, default: '' },
    weight: { type: String, default: '' },
    length: { type: String, default: '' },
    certification: { type: String, default: '' },
  },
  { _id: false }
)

const keyValueSchema = new mongoose.Schema(
  {
    key: { type: String, default: '' },
    value: { type: String, default: '' },
  },
  { _id: false }
)

const certificationSchema = new mongoose.Schema(
  {
    bisHallmark: { type: Boolean, default: false },
    bisLicense: { type: String, default: '' },
    diamondCertUrl: { type: String, default: '' },
    diamondCertNumber: { type: String, default: '' },
  },
  { _id: false }
)

const variantSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    sku: { type: String, default: '' },
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    reservedStock: { type: Number, default: 0 },
    images: { type: [String], default: [] },
    attributes: { type: [keyValueSchema], default: [] },
    certification: { type: certificationSchema, default: () => ({}) },
  },
  { _id: false }
)

const dimensionsSchema = new mongoose.Schema(
  {
    length: { type: String, default: '' },
    width: { type: String, default: '' },
    height: { type: String, default: '' },
    unit: { type: String, default: 'mm' },
  },
  { _id: false }
)

const shippingSchema = new mongoose.Schema(
  {
    weight: { type: String, default: '' },
    length: { type: String, default: '' },
    width: { type: String, default: '' },
    height: { type: String, default: '' },
    unit: { type: String, default: 'cm' },
    freeShipping: { type: Boolean, default: false },
  },
  { _id: false }
)

const productSchema = new mongoose.Schema(
  {
    // Core
    name: { type: String, default: '' },
    sku: { type: String, default: '' },
    category: { type: String, default: '' },
    subcategory: { type: String, default: '' },
    tags: { type: [String], default: [] },
    // Pricing
    price: { type: Number, default: 0 },
    originalPrice: { type: Number, default: 0 },
    discountType: { type: String, enum: ['none', 'percent', 'flat'], default: 'none' },
    discountValue: { type: Number, default: 0 },
    metalValue: { type: Number, default: 0 },
    makingCharge: { type: Number, default: 0 },
    useMakingChargePricing: { type: Boolean, default: false },
    // Media
    images: { type: [String], default: [] },
    imagesMeta: {
      type: [{ url: String, alt: String }],
      default: [],
    },
    // Content
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '' },
    // Spec (legacy flat + new top-level)
    specifications: { type: specificationsSchema, default: () => ({}) },
    material: { type: String, default: '' },
    weight: { type: String, default: '' },
    sizeOptions: { type: [String], default: [] },
    dimensions: { type: dimensionsSchema, default: () => ({}) },
    // Dynamic
    customAttributes: { type: [keyValueSchema], default: [] },
    variants: { type: [variantSchema], default: [] },
    // Inventory
    stock: { type: Number, default: 10 },
    reservedStock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    // Visibility
    published: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    publishAt: { type: Date, default: null },
    sizeChartId: { type: String, default: '' },
    certification: { type: certificationSchema, default: () => ({}) },
    // SEO
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    seoKeywords: { type: [String], default: [] },
    // Shipping
    shipping: { type: shippingSchema, default: () => ({}) },
  },
  { timestamps: true }
)

function normalizeCertification(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    bisHallmark: !!c.bisHallmark,
    bisLicense: String(c.bisLicense || '').trim(),
    diamondCertUrl: String(c.diamondCertUrl || '').trim(),
    diamondCertNumber: String(c.diamondCertNumber || '').trim(),
  }
}

function toClientProduct(doc) {
  const plain = doc.toObject ? doc.toObject() : { ...doc }
  const id = plain._id != null ? String(plain._id) : plain.id
  const imagesMeta =
    Array.isArray(plain.imagesMeta) && plain.imagesMeta.length > 0
      ? plain.imagesMeta.map((m) => ({
          url: String(m?.url || '').trim(),
          alt: String(m?.alt || '').trim(),
        })).filter((m) => m.url)
      : []
  const images =
    imagesMeta.length > 0
      ? imagesMeta.map((m) => m.url)
      : Array.isArray(plain.images) && plain.images.length > 0
        ? plain.images
        : plain.image
          ? [plain.image]
          : []
  return {
    id,
    name: plain.name || '',
    sku: plain.sku || '',
    category: plain.category || '',
    subcategory: plain.subcategory || '',
    tags: Array.isArray(plain.tags) ? plain.tags : [],
    price: Number(plain.price) || 0,
    originalPrice: Number(plain.originalPrice) || 0,
    discountType: plain.discountType || 'none',
    discountValue: Number(plain.discountValue) || 0,
    metalValue: Number(plain.metalValue) || 0,
    makingCharge: Number(plain.makingCharge) || 0,
    useMakingChargePricing: !!plain.useMakingChargePricing,
    image: images[0] || '',
    images,
    imagesMeta: imagesMeta.length > 0 ? imagesMeta : images.map((url) => ({ url, alt: '' })),
    description: plain.description || '',
    shortDescription: plain.shortDescription || '',
    specifications: plain.specifications || {
      material: '',
      color: '',
      weight: '',
      length: '',
      certification: '',
    },
    material: plain.material || plain.specifications?.material || '',
    weight: plain.weight || plain.specifications?.weight || '',
    sizeOptions: Array.isArray(plain.sizeOptions) ? plain.sizeOptions : [],
    dimensions: {
      length: plain.dimensions?.length || '',
      width: plain.dimensions?.width || '',
      height: plain.dimensions?.height || '',
      unit: plain.dimensions?.unit || 'mm',
    },
    customAttributes: Array.isArray(plain.customAttributes)
      ? plain.customAttributes
          .map((x) => ({ key: String(x?.key || '').trim(), value: String(x?.value || '').trim() }))
          .filter((x) => x.key && x.value)
      : [],
    variants: Array.isArray(plain.variants)
      ? plain.variants.map((v) => ({
          name: v?.name || '',
          sku: v?.sku || '',
          price: Number(v?.price) || 0,
          stock: Number(v?.stock) || 0,
          reservedStock: Number(v?.reservedStock) || 0,
          images: Array.isArray(v?.images) ? v.images.filter(Boolean) : [],
          attributes: Array.isArray(v?.attributes)
            ? v.attributes
                .map((x) => ({
                  key: String(x?.key || '').trim(),
                  value: String(x?.value || '').trim(),
                }))
                .filter((x) => x.key && x.value)
            : [],
          certification: normalizeCertification(v?.certification),
        }))
      : [],
    stock: plain.stock != null ? Number(plain.stock) : 10,
    reservedStock: plain.reservedStock != null ? Number(plain.reservedStock) : 0,
    lowStockThreshold: plain.lowStockThreshold != null ? Number(plain.lowStockThreshold) : 5,
    published: plain.published !== false,
    featured: !!plain.featured,
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null,
    publishAt: plain.publishAt || null,
    sizeChartId: String(plain.sizeChartId || '').trim(),
    certification: normalizeCertification(plain.certification),
    seoTitle: plain.seoTitle || '',
    seoDescription: plain.seoDescription || '',
    seoKeywords: Array.isArray(plain.seoKeywords) ? plain.seoKeywords : [],
    shipping: {
      weight: plain.shipping?.weight || '',
      length: plain.shipping?.length || '',
      width: plain.shipping?.width || '',
      height: plain.shipping?.height || '',
      unit: plain.shipping?.unit || 'cm',
      freeShipping: !!plain.shipping?.freeShipping,
    },
  }
}

productSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    return toClientProduct(ret)
  },
})

module.exports = mongoose.model('Product', productSchema)
module.exports.toClientProduct = toClientProduct
