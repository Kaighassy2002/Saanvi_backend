const DeliveryProvider = require('../contracts/DeliveryProvider')

class DHLAdapter extends DeliveryProvider {
  constructor() {
    super({ key: 'dhl', displayName: 'DHL' })
  }

  isConfigured() {
    return false
  }

  async createShipment(_order, _store) {
    throw new Error('DHL adapter is not configured yet')
  }

  async cancelShipment(_shipmentId) {
    throw new Error('DHL cancel shipment is not implemented yet')
  }

  async trackShipment(_awbOrShipmentId) {
    throw new Error('DHL tracking API mapping is not implemented yet')
  }

  generateTrackingUrl(_awb) {
    return ''
  }
}

module.exports = { DHLAdapter }
