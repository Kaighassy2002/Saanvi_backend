class DeliveryProvider {
  constructor({ key, displayName }) {
    this.key = String(key || '').toLowerCase()
    this.displayName = String(displayName || key || '').trim()
  }

  getKey() {
    return this.key
  }

  getDisplayName() {
    return this.displayName
  }

  isConfigured() {
    throw new Error('DeliveryProvider.isConfigured() must be implemented by adapter')
  }

  async createShipment(_order, _store) {
    throw new Error('DeliveryProvider.createShipment() must be implemented by adapter')
  }

  async cancelShipment(_shipmentId) {
    throw new Error('DeliveryProvider.cancelShipment() must be implemented by adapter')
  }

  async trackShipment(_awbOrShipmentId) {
    throw new Error('DeliveryProvider.trackShipment() must be implemented by adapter')
  }

  generateTrackingUrl(_awb) {
    return ''
  }
}

module.exports = DeliveryProvider
