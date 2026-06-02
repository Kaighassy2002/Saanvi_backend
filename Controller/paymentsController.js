const {
  isRazorpayConfigured,
  getPublicKeyId,
} = require('./helpers/razorpay')

async function getRazorpayConfig(_req, res) {
  res.json({
    enabled: isRazorpayConfigured(),
    keyId: isRazorpayConfigured() ? getPublicKeyId() : null,
    currency: 'INR',
  })
}

module.exports = {
  getRazorpayConfig,
}
