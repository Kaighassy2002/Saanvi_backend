const { DEFAULT_DELIVERY_PROVIDER } = require('./constants')

function deliveryConfigFromEnv() {
  return {
    defaultProvider: String(process.env.DELIVERY_DEFAULT_PROVIDER || DEFAULT_DELIVERY_PROVIDER)
      .trim()
      .toLowerCase(),
    delhivery: {
      token: String(process.env.DELHIVERY_API_TOKEN || '').trim(),
      baseUrl: String(process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com').trim(),
      warehouse: String(process.env.DELHIVERY_WAREHOUSE || 'Primary').trim(),
    },
  }
}

module.exports = {
  deliveryConfigFromEnv,
}
