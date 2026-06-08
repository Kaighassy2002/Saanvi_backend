const { getOrCreateSettings, resolveShippingFromDoc } = require('./helpers/siteSettings')

async function getPublicStoreSettings(_req, res) {
  const settings = await getOrCreateSettings()
  const client = settingsToClient(settings)
  res.json({
    shipping: client.shipping,
    heroSlides: client.heroSlides,
    featuredProductIds: client.featuredProductIds,
    homeCategoryImages: client.homeCategoryImages,
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

  const shippingFee = Number(feeRaw)
  const freeShippingThreshold = Number(thresholdRaw)

  if (!Number.isFinite(shippingFee) || shippingFee < 0) {
    return res.status(400).json({ message: 'shippingFee must be a number ≥ 0' })
  }
  if (!Number.isFinite(freeShippingThreshold) || freeShippingThreshold < 0) {
    return res.status(400).json({ message: 'freeShippingThreshold must be a number ≥ 0' })
  }

  const settings = await getOrCreateSettings()
  settings.shippingFee = Math.round(shippingFee)
  settings.freeShippingThreshold = Math.round(freeShippingThreshold)
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
    defaultGstPercent: settings.defaultGstPercent != null ? settings.defaultGstPercent : 3,
    defaultHsnCode: settings.defaultHsnCode || '7113',
    shipping,
    newArrivalProductIds: settings.newArrivalProductIds || [],
    featuredProductIds: settings.featuredProductIds || [],
    featuredCollectionIds: settings.featuredCollectionIds || [],
    heroSlides: settings.heroSlides || [],
    homeCategoryImages: settings.homeCategoryImages || [],
    categories: settings.categories || [],
  }
}

async function adminGetSettings(_req, res) {
  const settings = await getOrCreateSettings()
  res.json({ settings: settingsToClient(settings) })
}

async function adminUpdateSettings(req, res) {
  const body = req.body?.settings ?? req.body ?? {}
  const settings = await getOrCreateSettings()
  const stringFields = ['storeName', 'supportEmail', 'supportPhone', 'storeLocation', 'defaultHsnCode']
  for (const key of stringFields) {
    if (body[key] !== undefined) settings[key] = String(body[key])
  }
  if (body.defaultGstPercent !== undefined) settings.defaultGstPercent = Number(body.defaultGstPercent)
  if (body.newArrivalProductIds !== undefined) settings.newArrivalProductIds = body.newArrivalProductIds.map(String)
  if (body.featuredProductIds !== undefined) settings.featuredProductIds = body.featuredProductIds.map(String)
  if (body.featuredCollectionIds !== undefined) settings.featuredCollectionIds = body.featuredCollectionIds.map(String)
  if (body.heroSlides !== undefined) settings.heroSlides = body.heroSlides
  if (body.homeCategoryImages !== undefined) settings.homeCategoryImages = body.homeCategoryImages
  if (body.shipping) {
    const fee = Number(body.shipping.shippingFee)
    const threshold = Number(body.shipping.freeShippingThreshold)
    if (Number.isFinite(fee) && fee >= 0) settings.shippingFee = Math.round(fee)
    if (Number.isFinite(threshold) && threshold >= 0) settings.freeShippingThreshold = Math.round(threshold)
  }
  await settings.save()
  res.json({ settings: settingsToClient(settings) })
}

module.exports = {
  getPublicStoreSettings,
  adminGetShipping,
  adminUpdateShipping,
  adminGetSettings,
  adminUpdateSettings,
  settingsToClient,
}
