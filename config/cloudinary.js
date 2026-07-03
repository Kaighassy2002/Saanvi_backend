const cloudinary = require('cloudinary').v2

/** 4:5 product master — must match jewellery_frontend/src/utils/cloudinaryImage.js */
const PRODUCT_UPLOAD_TRANSFORM = 'c_pad,w_1200,h_1500,b_rgb:f8f2e7,f_auto,q_auto'

/** Home hero carousel — portrait-friendly fill */
const HERO_UPLOAD_TRANSFORM = 'c_fill,w_1600,h_2000,g_auto,f_auto,q_auto'

/** Home category circles / tiles — square crop */
const CATEGORY_UPLOAD_TRANSFORM = 'c_fill,w_800,h_800,g_auto,f_auto,q_auto'

/** Home promo banners — landscape crop */
const PROMO_UPLOAD_TRANSFORM = 'c_fill,w_1200,h_800,g_auto,f_auto,q_auto'

/** Homepage assets (hero, categories, promos) — Jewellery/Home in Media Library */
function getHomeFolder() {
  return process.env.CLOUDINARY_FOLDER_HOME || 'Jewellery/Home'
}

const UPLOAD_PURPOSES = {
  product: {
    folder: () => process.env.CLOUDINARY_FOLDER || 'Jewellery/Products',
    transformation: PRODUCT_UPLOAD_TRANSFORM,
  },
  hero: {
    folder: () => process.env.CLOUDINARY_FOLDER_HERO || getHomeFolder(),
    transformation: HERO_UPLOAD_TRANSFORM,
  },
  category: {
    folder: () => process.env.CLOUDINARY_FOLDER_CATEGORY || getHomeFolder(),
    transformation: CATEGORY_UPLOAD_TRANSFORM,
  },
  promo: {
    folder: () => process.env.CLOUDINARY_FOLDER_PROMO || getHomeFolder(),
    transformation: PROMO_UPLOAD_TRANSFORM,
  },
}

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  )
}

function configureCloudinary() {
  if (!isCloudinaryConfigured()) return false
  cloudinary.config({
    cloud_name: String(process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    api_key: String(process.env.CLOUDINARY_API_KEY || '').trim(),
    api_secret: String(process.env.CLOUDINARY_API_SECRET || '').trim(),
    secure: true,
    signature_version: 1,
    signature_algorithm: 'sha1',
  })
  return true
}

function getUploadFolder() {
  return UPLOAD_PURPOSES.product.folder()
}

function getUploadConfig(purpose = 'product') {
  const key = String(purpose || 'product').toLowerCase()
  const cfg = UPLOAD_PURPOSES[key] || UPLOAD_PURPOSES.product
  return {
    purpose: key in UPLOAD_PURPOSES ? key : 'product',
    folder: cfg.folder(),
    transformation: cfg.transformation,
  }
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  configureCloudinary,
  getUploadFolder,
  getUploadConfig,
  PRODUCT_UPLOAD_TRANSFORM,
  HERO_UPLOAD_TRANSFORM,
  CATEGORY_UPLOAD_TRANSFORM,
  PROMO_UPLOAD_TRANSFORM,
}
