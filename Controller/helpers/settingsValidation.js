const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function validateGstin(value) {
  const v = String(value || '').trim().toUpperCase()
  if (!v) return null
  if (v.length !== 15 || !GSTIN_RE.test(v)) {
    return 'GSTIN must be 15 characters in valid format (e.g. 22AAAAA0000A1Z5)'
  }
  return null
}

function validateEmail(value, { required = false } = {}) {
  const v = String(value || '').trim()
  if (!v) return required ? 'Email is required' : null
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address'
  return null
}

function validatePhone(value, { required = false } = {}) {
  const digits = normalizeDigits(value)
  if (!digits) return required ? 'Phone is required' : null
  const local = digits.length > 10 ? digits.slice(-10) : digits
  if (local.length !== 10) return 'Enter a 10-digit Indian mobile number'
  return null
}

function validateGstPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 28) {
    return 'GST % must be between 0 and 28'
  }
  return null
}

function validateNonNegativeInt(value, label) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return `${label} must be 0 or greater`
  return null
}

function validateSettingsPayload(body) {
  const errors = {}
  const gstinErr = validateGstin(body.storeGstin)
  if (gstinErr) errors.storeGstin = gstinErr
  const emailErr = validateEmail(body.supportEmail)
  if (emailErr) errors.supportEmail = emailErr
  const phoneErr = validatePhone(body.supportPhone)
  if (phoneErr) errors.supportPhone = phoneErr
  if (body.whatsappPhone !== undefined && String(body.whatsappPhone || '').trim()) {
    const wa = normalizeDigits(body.whatsappPhone)
    if (wa.length < 10 || wa.length > 12) {
      errors.whatsappPhone = 'WhatsApp number should include country code (e.g. 919876543210)'
    }
  }
  if (body.defaultGstPercent !== undefined) {
    const gstErr = validateGstPercent(body.defaultGstPercent)
    if (gstErr) errors.defaultGstPercent = gstErr
  }
  if (body.shipping?.shippingFee !== undefined) {
    const err = validateNonNegativeInt(body.shipping.shippingFee, 'Shipping fee')
    if (err) errors.shippingFee = err
  }
  if (body.shipping?.freeShippingThreshold !== undefined) {
    const err = validateNonNegativeInt(body.shipping.freeShippingThreshold, 'Free shipping threshold')
    if (err) errors.freeShippingThreshold = err
  }
  if (body.codConfirmThreshold !== undefined) {
    const err = validateNonNegativeInt(body.codConfirmThreshold, 'COD confirm threshold')
    if (err) errors.codConfirmThreshold = err
  }
  if (!String(body.storeName || '').trim()) {
    errors.storeName = 'Store name is required'
  }
  return errors
}

module.exports = {
  validateSettingsPayload,
  validateGstin,
  validateEmail,
  validatePhone,
  normalizeDigits,
}
