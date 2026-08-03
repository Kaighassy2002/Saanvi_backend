/** Shared shipping validation for COD + Razorpay checkout. */

function normalizeShipping(raw = {}) {
  return {
    firstName: String(raw.firstName || '').trim(),
    lastName: String(raw.lastName || '').trim(),
    email: String(raw.email || '').trim().toLowerCase(),
    phone: String(raw.phone || '').replace(/\D/g, ''),
    address: String(raw.address || '').trim(),
    city: String(raw.city || '').trim(),
    state: String(raw.state || '').trim(),
    pincode: String(raw.pincode || '').trim(),
  }
}

function validateShipping(shipping) {
  if (!shipping?.firstName || !shipping?.lastName) return 'Valid shipping name required'
  if (!shipping?.email || !shipping.email.includes('@')) return 'Valid shipping email required'
  if (!shipping?.phone || shipping.phone.length < 10) return 'Valid shipping phone required'
  if (!shipping?.address) return 'Shipping address required'
  if (!shipping?.city || !shipping?.state) return 'Shipping city and state required'
  if (!/^\d{6}$/.test(String(shipping.pincode || ''))) return 'Valid 6-digit pincode required'
  return null
}

module.exports = { normalizeShipping, validateShipping }
