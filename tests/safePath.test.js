const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { safeInternalPath } = require('../Controller/helpers/safePath')

describe('safeInternalPath', () => {
  it('blocks javascript: URLs', () => {
    assert.equal(safeInternalPath('javascript:alert(1)'), '/shop')
  })

  it('allows internal paths', () => {
    assert.equal(safeInternalPath('/shop?category=Ring'), '/shop?category=Ring')
  })

  it('allows https URLs', () => {
    assert.equal(safeInternalPath('https://example.com/x'), 'https://example.com/x')
  })

  it('blocks protocol-relative URLs', () => {
    assert.equal(safeInternalPath('//evil.com'), '/shop')
  })
})
