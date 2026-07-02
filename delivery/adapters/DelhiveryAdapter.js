const DeliveryProvider = require('../contracts/DeliveryProvider')
const { standardizeDeliveryResponse } = require('../utils')

class DelhiveryAdapter extends DeliveryProvider {
  constructor({ config }) {
    super({ key: 'delhivery', displayName: 'Delhivery' })
    this.config = config || {}
  }

  isConfigured() {
    return Boolean(this.config.token)
  }

  async createShipment(order, store) {
    const { token, warehouse, baseUrl } = this.config
    const shipping = order.shipping || {}
    const items = Array.isArray(order.items) ? order.items : []

    const shipment = {
      name: [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || order.customerName,
      add: shipping.address || shipping.line1 || '',
      pin: String(shipping.pincode || shipping.zip || ''),
      city: shipping.city || '',
      state: shipping.state || '',
      country: 'India',
      phone: String(shipping.phone || '').replace(/\D/g, '').slice(-10),
      order: order.publicId || order.id,
      payment_mode: String(order.paymentMethod || '').toLowerCase() === 'cod' ? 'COD' : 'Prepaid',
      return_pin: '',
      return_city: '',
      return_phone: '',
      return_add: '',
      return_state: '',
      return_country: 'India',
      products_desc: items.map((i) => i.name).join(', ').slice(0, 200),
      hsn_code: store.defaultHsnCode || '7113',
      cod_amount: String(order.paymentMethod || '').toLowerCase() === 'cod' ? String(order.total) : '0',
      order_date: order.date || new Date().toISOString().slice(0, 10),
      total_amount: String(order.total || 0),
      seller_add: store.storeLocation || '',
      seller_name: store.storeName || '',
      quantity: String(items.reduce((s, i) => s + Number(i.quantity || i.qty || 1), 0)),
      waybill: '',
      shipment_width: '10',
      shipment_height: '5',
      weight: String(Math.max(0.1, items.length * 0.15)),
      seller_gst_tin: store.storeGstin || '',
      shipping_mode: 'Surface',
      address_type: 'home',
    }

    const form = new URLSearchParams()
    form.set('format', 'json')
    form.set(
      'data',
      JSON.stringify({
        shipments: [shipment],
        pickup_location: { name: warehouse },
      })
    )

    const res = await fetch(`${baseUrl}/api/cmu/create.json`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const data = await res.json()
    const pkg = data?.packages?.[0] || data?.package || data
    const awb = String(pkg?.waybill || pkg?.awb || '').trim()
    if (!awb) {
      throw new Error(data?.rmk || data?.message || 'Delhivery AWB generation failed')
    }

    return standardizeDeliveryResponse(
      {
        partner: this.getDisplayName(),
        awb,
        shipmentId: awb,
        trackingUrl: this.generateTrackingUrl(awb),
        status: 'created',
        rawResponse: data,
      },
      { providerName: this.getDisplayName() }
    )
  }

  async cancelShipment(_shipmentId) {
    throw new Error('Delhivery cancel shipment is not implemented yet')
  }

  async trackShipment(_awbOrShipmentId) {
    throw new Error('Delhivery tracking API mapping is not implemented yet')
  }

  generateTrackingUrl(awb) {
    const code = String(awb || '').trim()
    if (!code) return ''
    return `https://www.delhivery.com/track/package/${code}`
  }
}

module.exports = { DelhiveryAdapter }
