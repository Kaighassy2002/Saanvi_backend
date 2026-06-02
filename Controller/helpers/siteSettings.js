const SiteSettings = require('../../Models/SiteSettings')

function shippingDefaultsFromEnv() {
  return {
    shippingFee: Number(process.env.SHIPPING_FEE || 99),
    freeShippingThreshold: Number(process.env.FREE_SHIPPING_THRESHOLD || 2999),
  }
}

function resolveShippingFromDoc(doc) {
  const env = shippingDefaultsFromEnv()
  const fee = doc?.shippingFee
  const threshold = doc?.freeShippingThreshold
  return {
    shippingFee:
      fee != null && Number.isFinite(Number(fee)) && Number(fee) >= 0
        ? Number(fee)
        : env.shippingFee,
    freeShippingThreshold:
      threshold != null && Number.isFinite(Number(threshold)) && Number(threshold) >= 0
        ? Number(threshold)
        : env.freeShippingThreshold,
  }
}

async function getOrCreateSettings() {
  const defaults = shippingDefaultsFromEnv()
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({
      categories: [],
      newArrivalProductIds: [],
      shippingFee: defaults.shippingFee,
      freeShippingThreshold: defaults.freeShippingThreshold,
    })
  }
  return doc
}

async function getShippingSettings() {
  const doc = await getOrCreateSettings()
  return resolveShippingFromDoc(doc)
}

function computeShippingFee(subtotal, { shippingFee, freeShippingThreshold }) {
  const n = Math.max(0, Number(subtotal) || 0)
  if (n <= 0) return 0
  if (n >= freeShippingThreshold) return 0
  return shippingFee
}

module.exports = {
  getOrCreateSettings,
  getShippingSettings,
  resolveShippingFromDoc,
  shippingDefaultsFromEnv,
  computeShippingFee,
}
