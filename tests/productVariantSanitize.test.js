const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  sanitizeVariantList,
  variantsFieldNeedsRepair,
  isVariantObject,
} = require('../Controller/helpers/productVariantSanitize')

describe('productVariantSanitize', () => {
  it('detects corrupt variant shapes', () => {
    assert.equal(variantsFieldNeedsRepair(1), true)
    assert.equal(variantsFieldNeedsRepair([1]), true)
    assert.equal(variantsFieldNeedsRepair([{ name: 'Red', stock: 2 }]), false)
    assert.equal(variantsFieldNeedsRepair(null), false)
  })

  it('drops non-object variant entries', () => {
    const rows = sanitizeVariantList([1, { name: 'Red', stock: 3, price: 250 }])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'Red')
    assert.equal(rows[0].stock, 3)
    assert.equal(rows[0].price, 250)
  })

  it('returns empty array for scalar variants', () => {
    assert.deepEqual(sanitizeVariantList(1), [])
    assert.deepEqual(sanitizeVariantList('bad'), [])
  })

  it('identifies variant objects', () => {
    assert.equal(isVariantObject({ name: 'Gold' }), true)
    assert.equal(isVariantObject(1), false)
    assert.equal(isVariantObject(null), false)
  })
})
