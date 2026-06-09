const { getOrCreateSettings, resolveShippingFromDoc } = require('./helpers/siteSettings')
const { validateSettingsPayload, normalizeDigits } = require('./helpers/settingsValidation')
const { isCloudinaryConfigured } = require('../config/cloudinary')
const { isRazorpayConfigured, getPublicKeyId } = require('./helpers/razorpay')
const { isMailConfigured } = require('./helpers/otpEmail')
const {
  isShiprocketConfigured,
  isDelhiveryConfigured,
} = require('./helpers/orderCourier')
const {
  sanitizePromoBanners,
  sanitizeHomeServices,
  sanitizeHomeSections,
} = require('./helpers/homeContent')

function publicProfileFromSettings(settings) {
  return {
    storeName: settings.storeName || '',
    supportEmail: settings.supportEmail || '',
    supportPhone: settings.supportPhone || '',
    storeLocation: settings.storeLocation || '',
    whatsappPhone: settings.whatsappPhone || '',
    announcementMessage: settings.announcementMessage || '',
    instagramUrl: settings.instagramUrl || '',
    codEnabled: settings.codEnabled !== false,
  }
}

async function getPublicStoreSettings(_req, res) {
  const settings = await getOrCreateSettings()
  const client = settingsToClient(settings)
  res.json({
    ...publicProfileFromSettings(settings),
    shipping: client.shipping,
    heroSlides: client.heroSlides,
    featuredProductIds: client.featuredProductIds,
    homeCategoryImages: client.homeCategoryImages,
    promoBanners: client.promoBanners,
    homeServices: client.homeServices,
    homeSections: client.homeSections,
  })
}

async function adminGetShipping(_req, res) {
  const settings = await getOrCreateSettings()
  const shipping = resolveShippingFromDoc(settings)
  res.json({ shipping })
}

async function adminUpdateShipping(req, res) {
  const body = req.body?.shipping ?? req.body ?? {}
  const feeRaw = body.shippingFee ?? body.fee
  const thresholdRaw = body.freeShippingThreshold ?? body.threshold

  if (feeRaw === undefined || thresholdRaw === undefined) {
    return res.status(400).json({ message: 'shippingFee and freeShippingThreshold are required' })
  }

  const errors = validateSettingsPayload({
    shipping: { shippingFee: feeRaw, freeShippingThreshold: thresholdRaw },
  })
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Validation failed', errors })
  }

  const shippingFee = Math.round(Number(feeRaw))
  const freeShippingThreshold = Math.round(Number(thresholdRaw))

  const settings = await getOrCreateSettings()
  settings.shippingFee = shippingFee
  settings.freeShippingThreshold = freeShippingThreshold
  await settings.save()

  res.json({ shipping: resolveShippingFromDoc(settings) })
}

function settingsToClient(settings) {
  const shipping = resolveShippingFromDoc(settings)
  return {
    storeName: settings.storeName || '',
    supportEmail: settings.supportEmail || '',
    supportPhone: settings.supportPhone || '',
    storeLocation: settings.storeLocation || '',
    storeState: settings.storeState || '',
    storeGstin: settings.storeGstin || '',
    defaultGstPercent: settings.defaultGstPercent != null ? settings.defaultGstPercent : 3,
    defaultHsnCode: settings.defaultHsnCode || '7113',
    codConfirmThreshold: settings.codConfirmThreshold != null ? settings.codConfirmThreshold : 10000,
    codEnabled: settings.codEnabled !== false,
    whatsappPhone: settings.whatsappPhone || '',
    announcementMessage: settings.announcementMessage || '',
    instagramUrl: settings.instagramUrl || '',
    shipping,
    newArrivalProductIds: settings.newArrivalProductIds || [],
    featuredProductIds: settings.featuredProductIds || [],
    heroSlides: settings.heroSlides || [],
    homeCategoryImages: settings.homeCategoryImages || [],
    promoBanners: settings.promoBanners || [],
    homeServices: settings.homeServices || [],
    homeSections: settings.homeSections || {},
    categories: settings.categories || [],
  }
}

async function adminGetSettings(_req, res) {
  const settings = await getOrCreateSettings()
  res.json({ settings: settingsToClient(settings) })
}

async function adminUpdateSettings(req, res) {
  const body = req.body?.settings ?? req.body ?? {}
  const errors = validateSettingsPayload(body)
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Validation failed', errors })
  }

  const settings = await getOrCreateSettings()
  const stringFields = [
    'storeName',
    'supportEmail',
    'supportPhone',
    'storeLocation',
    'storeState',
    'storeGstin',
    'defaultHsnCode',
    'announcementMessage',
    'instagramUrl',
  ]
  for (const key of stringFields) {
    if (body[key] !== undefined) {
      settings[key] = key === 'storeGstin' ? String(body[key]).trim().toUpperCase() : String(body[key]).trim()
    }
  }
  if (body.whatsappPhone !== undefined) {
    settings.whatsappPhone = normalizeDigits(body.whatsappPhone)
  }
  if (body.defaultGstPercent !== undefined) settings.defaultGstPercent = Number(body.defaultGstPercent)
  if (body.codConfirmThreshold !== undefined) settings.codConfirmThreshold = Math.round(Number(body.codConfirmThreshold))
  if (body.codEnabled !== undefined) settings.codEnabled = !!body.codEnabled
  if (body.newArrivalProductIds !== undefined) settings.newArrivalProductIds = body.newArrivalProductIds.map(String)
  if (body.featuredProductIds !== undefined) settings.featuredProductIds = body.featuredProductIds.map(String)
  if (body.heroSlides !== undefined) settings.heroSlides = body.heroSlides
  if (body.homeCategoryImages !== undefined) settings.homeCategoryImages = body.homeCategoryImages
  if (body.promoBanners !== undefined) settings.promoBanners = sanitizePromoBanners(body.promoBanners)
  if (body.homeServices !== undefined) settings.homeServices = sanitizeHomeServices(body.homeServices)
  if (body.homeSections !== undefined) settings.homeSections = sanitizeHomeSections(body.homeSections)
  if (body.shipping) {
    const fee = Number(body.shipping.shippingFee)
    const threshold = Number(body.shipping.freeShippingThreshold)
    if (Number.isFinite(fee) && fee >= 0) settings.shippingFee = Math.round(fee)
    if (Number.isFinite(threshold) && threshold >= 0) settings.freeShippingThreshold = Math.round(threshold)
  }
  await settings.save()
  res.json({ settings: settingsToClient(settings) })
}

async function adminGetIntegrationsHealth(_req, res) {
  const adminNotify =
    String(process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').trim() || null

  res.json({
    razorpay: {
      configured: isRazorpayConfigured(),
      keyId: isRazorpayConfigured() ? getPublicKeyId() : null,
    },
    email: {
      configured: isMailConfigured(),
      adminNotifyEmail: adminNotify,
    },
    cloudinary: {
      configured: isCloudinaryConfigured(),
      cloudName: isCloudinaryConfigured()
        ? String(process.env.CLOUDINARY_CLOUD_NAME || '').trim()
        : null,
    },
    couriers: {
      shiprocket: isShiprocketConfigured(),
      delhivery: isDelhiveryConfigured(),
    },
  })
}

module.exports = {
  getPublicStoreSettings,
  adminGetShipping,
  adminUpdateShipping,
  adminGetSettings,
  adminUpdateSettings,
  adminGetIntegrationsHealth,
  settingsToClient,
  publicProfileFromSettings,
}
