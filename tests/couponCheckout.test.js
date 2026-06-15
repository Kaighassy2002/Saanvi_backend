const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { computeDiscount, round2 } = require('../Controller/helpers/couponCheckout')

describe('couponCheckout', () => {
  it('computes percent discount', () => {
    assert.equal(computeDiscount({ type: 'percent', value: 10 }, 1000), 100)
  })

  it('computes flat discount capped at subtotal', () => {
    assert.equal(computeDiscount({ type: 'flat', value: 500 }, 300), 300)
    assert.equal(computeDiscount({ type: 'flat', value: 200 }, 1000), 200)
  })

  it('rounds to 2 decimal places', () => {
    assert.equal(round2(10.126), 10.13)
  })
})
