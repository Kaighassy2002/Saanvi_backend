const DeliveryProvider = require('../contracts/DeliveryProvider')

class XpressBeesAdapter extends DeliveryProvider {
  constructor() {
    super({ key: 'xpressbees', displayName: 'XpressBees' })
  }

  isConfigured() {
    return false
  }

  async createShipment(_order, _store) {
    throw new Error('XpressBees adapter is not configured yet')
  }

  async cancelShipment(_shipmentId) {
    throw new Error('XpressBees cancel shipment is not implemented yet')
  }

  async trackShipment(_awbOrShipmentId) {
    throw new Error('XpressBees tracking API mapping is not implemented yet')
  }

  generateTrackingUrl(_awb) {
    return ''
  }
}

module.exports = { XpressBeesAdapter }
