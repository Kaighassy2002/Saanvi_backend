const DeliveryProvider = require('../contracts/DeliveryProvider')

class DtdcAdapter extends DeliveryProvider {
  constructor() {
    super({ key: 'dtdc', displayName: 'DTDC' })
  }

  isConfigured() {
    return false
  }

  async createShipment(_order, _store) {
    throw new Error('DTDC adapter is not configured yet')
  }

  async cancelShipment(_shipmentId) {
    throw new Error('DTDC cancel shipment is not implemented yet')
  }

  async trackShipment(_awbOrShipmentId) {
    throw new Error('DTDC tracking API mapping is not implemented yet')
  }

  generateTrackingUrl(_awb) {
    return ''
  }
}

module.exports = { DtdcAdapter }
