const {
  cloudinary,
  isCloudinaryConfigured,
  configureCloudinary,
  getUploadConfig,
} = require('../config/cloudinary')

async function adminGetCloudinarySignature(req, res) {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      message:
        'Image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.',
    })
  }
  configureCloudinary()

  const { purpose, folder, transformation } = getUploadConfig(req.query.purpose)
  const timestamp = Math.round(Date.now() / 1000)
  const paramsToSign = {
    timestamp,
    folder,
    transformation,
    // Restrict uploads to image types and size (Cloudinary enforces on upload).
    allowed_formats: 'jpg,jpeg,png,webp',
    max_file_size: 5_000_000,
  }
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  )

  res.json({
    signature,
    timestamp,
    folder,
    transformation,
    purpose,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  })
}

module.exports = {
  adminGetCloudinarySignature,
}
