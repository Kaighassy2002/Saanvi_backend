const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const {
  verifyPaymentSignature,
  verifyWebhookSignature,
  timingSafeEqualHex,
} = require('../Controller/helpers/razorpay')
const {
  onlinePaymentViaPlaceOrderBlockedMessage,
  normalizePaymentMethodKey,
} = require('../Controller/helpers/checkoutPolicy')
const { normalizeShipping, validateShipping } = require('../Controller/helpers/checkoutShipping')

describe('razorpay signature security', () => {
  it('accepts a valid payment signature with timing-safe compare', () => {
    const prev = process.env.RAZORPAY_KEY_SECRET
    process.env.RAZORPAY_KEY_SECRET = 'test_secret_key_for_hmac'
    try {
      const orderId = 'order_ABC'
      const paymentId = 'pay_XYZ'
      const digest = crypto
        .createHmac('sha256', 'test_secret_key_for_hmac')
        .update(`${orderId}|${paymentId}`)
        .digest('hex')
      assert.equal(
        verifyPaymentSignature({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: digest,
        }),
        true
      )
      assert.equal(
        verifyPaymentSignature({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: '0'.repeat(digest.length),
        }),
        false
      )
    } finally {
      if (prev === undefined) delete process.env.RAZORPAY_KEY_SECRET
      else process.env.RAZORPAY_KEY_SECRET = prev
    }
  })

  it('rejects unequal-length signatures without throwing', () => {
    assert.equal(timingSafeEqualHex('abc', 'abcd'), false)
    assert.equal(timingSafeEqualHex('', 'a'), false)
  })

  it('verifies webhook signatures against RAZORPAY_WEBHOOK_SECRET', () => {
    const prev = process.env.RAZORPAY_WEBHOOK_SECRET
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test'
    try {
      const body = Buffer.from('{"event":"payment.captured","id":"evt_1"}')
      const sig = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex')
      assert.equal(verifyWebhookSignature(body, sig), true)
      assert.equal(verifyWebhookSignature(body, 'deadbeef'), false)
    } finally {
      if (prev === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
      else process.env.RAZORPAY_WEBHOOK_SECRET = prev
    }
  })
})

describe('payment bypass prevention', () => {
  it('blocks online methods on POST /orders place-order path', () => {
    assert.match(onlinePaymentViaPlaceOrderBlockedMessage('razorpay'), /secure payment/i)
    assert.match(onlinePaymentViaPlaceOrderBlockedMessage('upi'), /secure payment/i)
    assert.match(onlinePaymentViaPlaceOrderBlockedMessage('card'), /secure payment/i)
    assert.equal(onlinePaymentViaPlaceOrderBlockedMessage('cod'), null)
    assert.equal(normalizePaymentMethodKey('online'), 'razorpay')
  })
})

describe('checkout shipping validation', () => {
  it('normalizes and validates shipping for intent storage', () => {
    const shipping = normalizeShipping({
      firstName: ' Ada ',
      lastName: ' Lovelace ',
      email: 'Ada@Example.com',
      phone: '+91 98765-43210',
      address: '12 Main St',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
    })
    assert.equal(shipping.email, 'ada@example.com')
    assert.equal(shipping.phone, '919876543210')
    assert.equal(validateShipping(shipping), null)
    assert.match(validateShipping({ ...shipping, pincode: '12' }), /pincode/i)
  })
})
