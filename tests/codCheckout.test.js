const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  codPaymentBlockedMessage,
  normalizePaymentMethodKey,
} = require('../Controller/helpers/checkoutPolicy')

describe('checkoutPolicy', () => {
  it('normalizes online payment aliases to razorpay', () => {
    assert.equal(normalizePaymentMethodKey('upi'), 'razorpay')
    assert.equal(normalizePaymentMethodKey('card'), 'razorpay')
    assert.equal(normalizePaymentMethodKey('cod'), 'cod')
  })

  it('blocks COD when codEnabled is false', () => {
    const msg = codPaymentBlockedMessage({ codEnabled: false }, 'cod')
    assert.equal(msg, 'Cash on delivery is not available')
  })

  it('allows COD when codEnabled is true', () => {
    assert.equal(codPaymentBlockedMessage({ codEnabled: true }, 'cod'), null)
  })

  it('allows COD when codEnabled is undefined (default on)', () => {
    assert.equal(codPaymentBlockedMessage({}, 'cod'), null)
  })

  it('does not block razorpay when cod is disabled', () => {
    assert.equal(codPaymentBlockedMessage({ codEnabled: false }, 'razorpay'), null)
  })
})
