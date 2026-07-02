const { appendHistoryEntry } = require('../Controller/helpers/orderWorkflow')
const { DEFAULT_DELIVERY_PROVIDER } = require('./constants')
const { normalizeProviderKey } = require('./utils')

class DeliveryService {
  constructor({ manager, defaultProvider = DEFAULT_DELIVERY_PROVIDER }) {
    this.manager = manager
    this.defaultProvider = defaultProvider
  }

  async createShipmentForOrder({ orderDoc, store, partner, actorEmail }) {
    const providerKey = normalizeProviderKey(partner, this.defaultProvider)
    const result = await this.manager.createShipment(orderDoc.toObject(), store, providerKey)
    const trackingUrl =
      result.trackingUrl || this.manager.generateTrackingUrlForPartner(providerKey, result.awb)

    orderDoc.courierPartner = result.partner
    orderDoc.courierAwb = result.awb
    orderDoc.courierShipmentId = result.shipmentId || ''
    orderDoc.trackingNumber = result.awb || orderDoc.trackingNumber
    orderDoc.trackingUrl = trackingUrl
    orderDoc.statusHistory = appendHistoryEntry(orderDoc.statusHistory, {
      status: orderDoc.status,
      paymentStatus: orderDoc.paymentStatus,
      note: `AWB generated via ${result.partner}: ${result.awb || 'pending'}`,
      by: String(actorEmail || 'admin'),
    })
    await orderDoc.save()

    return { orderDoc, courier: result, partner: providerKey }
  }
}

module.exports = { DeliveryService }
