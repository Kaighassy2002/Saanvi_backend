const DeliveryProvider = require('../contracts/DeliveryProvider')

class BlueDartAdapter extends DeliveryProvider {
  constructor() {
    super({ key: 'bluedart', displayName: 'Blue Dart' })
  }

  isConfigured() {
    return false
  }

  async createShipment(_order, _store) {
    throw new Error('Blue Dart adapter is not configured yet')
  }

  async cancelShipment(_shipmentId) {
    throw new Error('Blue Dart cancel shipment is not implemented yet')
  }

  async trackShipment(_awbOrShipmentId) {
    throw new Error('Blue Dart tracking API mapping is not implemented yet')
  }

  generateTrackingUrl(awb) {
    const code = String(awb || '').trim()
    if (!code) return ''
    return `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${code}`
  }
}

module.exports = { BlueDartAdapter }
