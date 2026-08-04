/**
 * Smoke-check collection helpers (no DB).
 */
const {
  slugify,
  isStorefrontVisible,
} = require('../Controller/collectionController')
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

describe('collection helpers', () => {
  it('slugifies collection names', () => {
    assert.equal(slugify('Onam Collection 2026'), 'onam-collection-2026')
  })

  it('hides drafts from storefront', () => {
    assert.equal(isStorefrontVisible({ published: false }), false)
  })

  it('hides scheduled future collections', () => {
    const startsAt = new Date(Date.now() + 86400000)
    assert.equal(isStorefrontVisible({ published: true, startsAt }), false)
  })

  it('shows published collections in window', () => {
    assert.equal(isStorefrontVisible({ published: true, startsAt: null, endsAt: null }), true)
  })
})
