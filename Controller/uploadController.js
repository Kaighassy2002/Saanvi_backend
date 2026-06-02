const {
  cloudinary,
  isCloudinaryConfigured,
  configureCloudinary,
  getUploadFolder,
} = require('../config/cloudinary')

/** 4:5 product master — must match jewellery_frontend/src/utils/cloudinaryImage.js */
const PRODUCT_UPLOAD_TRANSFORM = 'c_pad,w_1200,h_1500,b_rgb:f8f2e7,f_auto,q_auto'

async function adminGetCloudinarySignature(_req, res) {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      message:
        'Image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.',
    })
  }
  configureCloudinary()

  const timestamp = Math.round(Date.now() / 1000)
  const folder = getUploadFolder()
  const paramsToSign = {
    timestamp,
    folder,
    transformation: PRODUCT_UPLOAD_TRANSFORM,
  }
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  )

  res.json({
    signature,
    timestamp,
    folder,
    transformation: PRODUCT_UPLOAD_TRANSFORM,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  })
}

module.exports = {
  adminGetCloudinarySignature,
}
