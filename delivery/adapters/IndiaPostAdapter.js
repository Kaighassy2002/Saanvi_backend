const DeliveryProvider = require('../contracts/DeliveryProvider')

class IndiaPostAdapter extends DeliveryProvider {
  constructor() {
    super({ key: 'indiapost', displayName: 'India Post' })
  }

  isConfigured() {
    return false
  }

  async createShipment(_order, _store) {
    throw new Error('India Post adapter is not configured yet')
  }

  async cancelShipment(_shipmentId) {
    throw new Error('India Post cancel shipment is not implemented yet')
  }

  async trackShipment(_awbOrShipmentId) {
    throw new Error('India Post tracking API mapping is not implemented yet')
  }

  generateTrackingUrl(_awb) {
    return ''
  }
}

module.exports = { IndiaPostAdapter }
