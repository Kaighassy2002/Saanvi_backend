const { DEFAULT_DELIVERY_PROVIDER } = require('./constants')
const { normalizeProviderKey, unsupportedProviderError } = require('./utils')

class DeliveryManager {
  constructor({ providers = [], defaultProvider = DEFAULT_DELIVERY_PROVIDER } = {}) {
    this.providers = new Map()
    this.defaultProvider = normalizeProviderKey(defaultProvider, DEFAULT_DELIVERY_PROVIDER)

    for (const provider of providers) {
      if (!provider || typeof provider.getKey !== 'function') continue
      const key = normalizeProviderKey(provider.getKey())
      if (!key) continue
      this.providers.set(key, provider)
    }
  }

  resolvePartner(partner) {
    return normalizeProviderKey(partner, this.defaultProvider)
  }

  getProvider(partner) {
    const key = this.resolvePartner(partner)
    const provider = this.providers.get(key)
    if (!provider) throw unsupportedProviderError(key)
    if (!provider.isConfigured()) {
      throw new Error(`${provider.getDisplayName()} not configured`)
    }
    return provider
  }

  async createShipment(order, store, partner) {
    const provider = this.getProvider(partner)
    return provider.createShipment(order, store)
  }

  async cancelShipment(shipmentId, partner) {
    const provider = this.getProvider(partner)
    return provider.cancelShipment(shipmentId)
  }

  async trackShipment(awbOrShipmentId, partner) {
    const provider = this.getProvider(partner)
    return provider.trackShipment(awbOrShipmentId)
  }

  generateTrackingUrlForPartner(partner, awb) {
    const key = this.resolvePartner(partner)
    const provider = this.providers.get(key)
    if (!provider) return ''
    return provider.generateTrackingUrl(awb)
  }

  getProviderHealth() {
    const health = {}
    for (const [key, provider] of this.providers.entries()) {
      health[key] = provider.isConfigured()
    }
    return health
  }
}

module.exports = { DeliveryManager }
