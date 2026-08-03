function normalizePaymentMethodKey(method) {
  const key = String(method || '')
    .trim()
    .toLowerCase()
  if (key === 'razorpay' || key === 'online' || key === 'upi' || key === 'card') return 'razorpay'
  return 'cod'
}

/**
 * @param {{ codEnabled?: boolean }} settings
 * @param {string} paymentMethod
 * @returns {string|null} Error message when COD is not allowed, else null
 */
function codPaymentBlockedMessage(settings, paymentMethod) {
  const method = normalizePaymentMethodKey(paymentMethod)
  if (method === 'cod' && settings?.codEnabled === false) {
    return 'Cash on delivery is not available'
  }
  return null
}

/**
 * Online / Razorpay orders must never be created via POST /orders.
 * They require CheckoutIntent + Razorpay capture verification (or webhook).
 * @returns {string|null}
 */
function onlinePaymentViaPlaceOrderBlockedMessage(paymentMethod) {
  const method = normalizePaymentMethodKey(paymentMethod)
  if (method === 'razorpay') {
    return 'Online payment orders must be completed through the secure payment flow.'
  }
  return null
}

module.exports = {
  normalizePaymentMethodKey,
  codPaymentBlockedMessage,
  onlinePaymentViaPlaceOrderBlockedMessage,
}
