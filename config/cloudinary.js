const cloudinary = require('cloudinary').v2

/** 4:5 product master — must match jewellery_frontend/src/utils/cloudinaryImage.js */
const PRODUCT_UPLOAD_TRANSFORM = 'c_pad,w_1200,h_1500,b_rgb:f8f2e7,f_auto,q_auto'

/** Home hero carousel — portrait-friendly fill */
const HERO_UPLOAD_TRANSFORM = 'c_fill,w_1600,h_2000,g_auto,f_auto,q_auto'

/** Home category circles / tiles — square crop */
const CATEGORY_UPLOAD_TRANSFORM = 'c_fill,w_800,h_800,g_auto,f_auto,q_auto'

/** Home promo banners — landscape crop */
const PROMO_UPLOAD_TRANSFORM = 'c_fill,w_1200,h_800,g_auto,f_auto,q_auto'

const UPLOAD_PURPOSES = {
  product: {
    folder: () => process.env.CLOUDINARY_FOLDER || 'Home/Jewellery/Products',
    transformation: PRODUCT_UPLOAD_TRANSFORM,
  },
  hero: {
    folder: () => process.env.CLOUDINARY_FOLDER_HERO || 'Home/Jewellery/hero',
    transformation: HERO_UPLOAD_TRANSFORM,
  },
  category: {
    folder: () => process.env.CLOUDINARY_FOLDER_CATEGORY || 'Home/Jewellery/categories',
    transformation: CATEGORY_UPLOAD_TRANSFORM,
  },
  promo: {
    folder: () => process.env.CLOUDINARY_FOLDER_PROMO || 'Home/Jewellery/promo',
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
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
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
