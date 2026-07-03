const multer = require('multer')
const {
  cloudinary,
  isCloudinaryConfigured,
  configureCloudinary,
  getUploadConfig,
} = require('../config/cloudinary')

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5_000_000

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true)
      return
    }
    cb(new Error('Use JPEG, PNG, or WebP'))
  },
})

function uploadImageMiddleware(req, res, next) {
  multerUpload.single('file')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Image must be 5 MB or smaller' })
    }
    return res.status(400).json({ message: err.message || 'Invalid image file' })
  })
}

async function adminUploadImage(req, res) {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      message:
        'Image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.',
    })
  }
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ message: 'No image file provided' })
  }

  configureCloudinary()
  const { folder } = getUploadConfig(req.query.purpose)
  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'image',
    })
    res.json({
      secureUrl: result.secure_url,
      publicId: result.public_id || '',
      folder,
    })
  } catch (err) {
    const message = err?.message || 'Image upload failed'
    res.status(502).json({ message })
  }
}

/** @deprecated Prefer POST /admin/upload/image — kept for backward compatibility */
async function adminGetCloudinarySignature(req, res) {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      message:
        'Image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.',
    })
  }
  configureCloudinary()

  const { purpose, folder } = getUploadConfig(req.query.purpose)
  const timestamp = Math.round(Date.now() / 1000)
  const paramsToSign = { timestamp, folder }
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    String(process.env.CLOUDINARY_API_SECRET || '').trim(),
    'sha1',
    1
  )

  res.json({
    signature,
    timestamp,
    folder,
    purpose,
    cloudName: String(process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: String(process.env.CLOUDINARY_API_KEY || '').trim(),
  })
}

module.exports = {
  uploadImageMiddleware,
  adminUploadImage,
  adminGetCloudinarySignature,
}
