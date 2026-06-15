const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCheckoutLine } = require('../Controller/helpers/checkoutQuote')

describe('checkoutQuote', () => {
  it('coerces variant keys to strings', () => {
    const line = normalizeCheckoutLine({
      productId: '674a1b2c3d4e5f6789012345',
      quantity: 2,
      variantKey: 1,
      name: 'Ring',
    })
    assert.equal(line.variantKey, '1')
    assert.equal(line.variantName, '1')
    assert.equal(line.quantity, 2)
  })

  it('accepts variantName when variantKey is missing', () => {
    const line = normalizeCheckoutLine({
      productId: '674a1b2c3d4e5f6789012345',
      quantity: 1,
      variantName: 'Gold::6',
    })
    assert.equal(line.variantKey, 'Gold::6')
  })

  it('trims product id and name', () => {
    const line = normalizeCheckoutLine({
      productId: ' 674a1b2c3d4e5f6789012345 ',
      quantity: 1,
      name: '  Pendant ',
    })
    assert.equal(line.productId, '674a1b2c3d4e5f6789012345')
    assert.equal(line.name, 'Pendant')
  })
})
