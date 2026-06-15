const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { ALLOWED_ROLES } = require('../middleware/authAdmin')

describe('authAdmin', () => {
  it('allows known admin roles', () => {
    for (const role of ['admin', 'owner', 'catalog', 'fulfillment', 'support', 'superadmin']) {
      assert.ok(ALLOWED_ROLES.has(role))
    }
  })

  it('rejects unknown roles', () => {
    assert.equal(ALLOWED_ROLES.has('customer'), false)
    assert.equal(ALLOWED_ROLES.has(''), false)
  })
})
