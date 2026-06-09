/**
 * Courier AWB generation — Shiprocket or Delhivery when credentials are set.
 * Falls back to manual mode with clear instructions.
 */

const COURIER_PARTNERS = ['shiprocket', 'delhivery', 'manual']

function courierConfig() {
  return {
    shiprocket: {
      email: String(process.env.SHIPROCKET_EMAIL || '').trim(),
      password: String(process.env.SHIPROCKET_PASSWORD || '').trim(),
      pickupLocation: String(process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary').trim(),
    },
    delhivery: {
      token: String(process.env.DELHIVERY_API_TOKEN || '').trim(),
      warehouseName: String(process.env.DELHIVERY_WAREHOUSE || 'Primary').trim(),
    },
  }
}

function isShiprocketConfigured() {
  const c = courierConfig().shiprocket
  return Boolean(c.email && c.password)
}

function isDelhiveryConfigured() {
  return Boolean(courierConfig().delhivery.token)
}

async function shiprocketLogin() {
  const { email, password } = courierConfig().shiprocket
  const res = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok || !data.token) {
    throw new Error(data.message || 'Shiprocket login failed')
  }
  return data.token
}

async function createShiprocketAwb(order, store) {
  const token = await shiprocketLogin()
  const shipping = order.shipping || {}
  const items = Array.isArray(order.items) ? order.items : []
  const weightKg = Math.max(0.1, items.length * 0.15)

  const payload = {
    order_id: order.publicId || order.id,
    order_date: (order.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    pickup_location: courierConfig().shiprocket.pickupLocation,
    billing_customer_name: shipping.firstName || order.customerName || 'Customer',
    billing_last_name: shipping.lastName || '',
    billing_address: shipping.address || shipping.line1 || '',
    billing_city: shipping.city || '',
    billing_pincode: String(shipping.pincode || shipping.zip || ''),
    billing_state: shipping.state || '',
    billing_country: 'India',
    billing_email: order.customerEmail || shipping.email || '',
    billing_phone: String(shipping.phone || '').replace(/\D/g, '').slice(-10),
    shipping_is_billing: true,
    order_items: items.map((item) => ({
      name: String(item.name || 'Jewellery').slice(0, 100),
      sku: String(item.productId || item.sku || 'SKU').slice(0, 50),
      units: Number(item.quantity || item.qty || 1),
      selling_price: Number(item.price) || 0,
    })),
    payment_method: String(order.paymentMethod || '').toLowerCase() === 'cod' ? 'COD' : 'Prepaid',
    sub_total: Number(order.subtotal || order.total) || 0,
    length: 15,
    breadth: 10,
    height: 5,
    weight: weightKg,
  }

  const createRes = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const created = await createRes.json()
  if (!createRes.ok) {
    throw new Error(created.message || created.error || 'Shiprocket order creation failed')
  }

  const shipmentId = created.shipment_id || created.shipmentId
  if (!shipmentId) {
    throw new Error('Shiprocket did not return a shipment ID')
  }

  const awbRes = await fetch('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ shipment_id: shipmentId }),
  })
  const awbData = await awbRes.json()
  const awb =
    awbData?.response?.data?.awb_code ||
    awbData?.awb_code ||
    awbData?.awb ||
    ''

  return {
    partner: 'Shiprocket',
    awb: String(awb || ''),
    shipmentId: String(shipmentId),
    courierName: awbData?.response?.data?.courier_name || 'Shiprocket',
    trackingUrl: awb
      ? `https://shiprocket.co/tracking/${awb}`
      : '',
    raw: { create: created, awb: awbData },
  }
}

async function createDelhiveryAwb(order, store) {
  const { token, warehouseName } = courierConfig().delhivery
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
  form.set(
    'format',
    'json'
  )
  form.set(
    'data',
    JSON.stringify({
      shipments: [shipment],
      pickup_location: { name: warehouseName },
    })
  )

  const res = await fetch(
    `https://track.delhivery.com/api/cmu/create.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  )
  const data = await res.json()
  const pkg = data?.packages?.[0] || data?.package || data
  const awb = String(pkg?.waybill || pkg?.awb || '').trim()
  if (!awb) {
    throw new Error(data?.rmk || data?.message || 'Delhivery AWB generation failed')
  }

  return {
    partner: 'Delhivery',
    awb,
    shipmentId: awb,
    courierName: 'Delhivery',
    trackingUrl: `https://www.delhivery.com/track/package/${awb}`,
    raw: data,
  }
}

/**
 * @param {'shiprocket'|'delhivery'|'manual'} partner
 */
async function generateCourierAwb(order, store, partner = 'shiprocket') {
  const key = String(partner || 'shiprocket').toLowerCase()
  if (key === 'shiprocket') {
    if (!isShiprocketConfigured()) {
      throw new Error('Shiprocket not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in .env')
    }
    return createShiprocketAwb(order, store)
  }
  if (key === 'delhivery') {
    if (!isDelhiveryConfigured()) {
      throw new Error('Delhivery not configured. Set DELHIVERY_API_TOKEN in .env')
    }
    return createDelhiveryAwb(order, store)
  }
  throw new Error('Manual courier — enter AWB in admin tracking field')
}

function trackingUrlForPartner(partner, awb) {
  const p = String(partner || '').toLowerCase()
  const code = String(awb || '').trim()
  if (!code) return ''
  if (p.includes('shiprocket')) return `https://shiprocket.co/tracking/${code}`
  if (p.includes('delhivery')) return `https://www.delhivery.com/track/package/${code}`
  if (p.includes('bluedart')) return `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${code}`
  return ''
}

module.exports = {
  COURIER_PARTNERS,
  courierConfig,
  isShiprocketConfigured,
  isDelhiveryConfigured,
  generateCourierAwb,
  trackingUrlForPartner,
}
