const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseDiscoveryLimit } = require('../Controller/helpers/storefrontListing')

describe('productDiscovery', () => {
  it('parseDiscoveryLimit uses fallback for invalid values', () => {
    assert.equal(parseDiscoveryLimit(undefined, 6, 12), 6)
    assert.equal(parseDiscoveryLimit('abc', 10, 24), 10)
  })

  it('parseDiscoveryLimit caps at max', () => {
    assert.equal(parseDiscoveryLimit(100, 10, 24), 24)
    assert.equal(parseDiscoveryLimit('8', 10, 24), 8)
  })
})
