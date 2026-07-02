const { deliveryManager, deliveryConfigFromEnv } = require('../../delivery')
const { DEFAULT_DELIVERY_PROVIDER } = require('../../delivery/constants')

const COURIER_PARTNERS = ['delhivery', 'manual']

function courierConfig() {
  const config = deliveryConfigFromEnv()
  return {
    delhivery: config.delhivery,
  }
}

function isDelhiveryConfigured() {
  return Boolean(deliveryManager.getProviderHealth().delhivery)
}

function getCourierHealth() {
  return deliveryManager.getProviderHealth()
}

/**
 * Backward-compatible facade over the DeliveryManager strategy.
 * @param {'delhivery'|'manual'} partner
 */
async function generateCourierAwb(order, store, partner = DEFAULT_DELIVERY_PROVIDER) {
  return deliveryManager.createShipment(order, store, partner)
}

function trackingUrlForPartner(partner, awb) {
  return deliveryManager.generateTrackingUrlForPartner(partner, awb)
}

module.exports = {
  COURIER_PARTNERS,
  courierConfig,
  isDelhiveryConfigured,
  getCourierHealth,
  generateCourierAwb,
  trackingUrlForPartner,
}
