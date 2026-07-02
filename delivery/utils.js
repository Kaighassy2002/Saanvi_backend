const { MANUAL_PROVIDER } = require('./constants')

function normalizeProviderKey(value, fallback) {
  const key = String(value || fallback || '')
    .trim()
    .toLowerCase()
  return key || fallback || ''
}

function standardizeDeliveryResponse(input, { providerName }) {
  const data = input || {}
  return {
    partner: String(data.partner || providerName || '').trim(),
    awb: String(data.awb || '').trim(),
    shipmentId: String(data.shipmentId || '').trim(),
    trackingUrl: String(data.trackingUrl || '').trim(),
    status: String(data.status || 'unknown').trim().toLowerCase(),
    rawResponse: data.rawResponse ?? data.raw ?? null,
  }
}

function unsupportedProviderError(partner) {
  return new Error(
    partner === MANUAL_PROVIDER
      ? 'Manual courier — enter AWB in admin tracking field'
      : `Unsupported courier provider: ${partner}`
  )
}

module.exports = {
  normalizeProviderKey,
  standardizeDeliveryResponse,
  unsupportedProviderError,
}
