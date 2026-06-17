const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  getEffectivePermissions,
  getRoleDefaultPermissions,
  hasPermission,
  sanitizePermissions,
} = require('../middleware/adminPermissions')

describe('adminPermissions', () => {
  it('grants owner all permissions', () => {
    const perms = getEffectivePermissions({ role: 'owner', permissions: [] })
    assert.ok(hasPermission({ role: 'owner', permissions: [] }, 'staff'))
    assert.ok(hasPermission({ role: 'owner', permissions: [] }, 'settings'))
    assert.equal(perms.size, 8)
  })

  it('uses role defaults when permissions array is empty', () => {
    assert.deepEqual(getRoleDefaultPermissions('catalog'), ['dashboard', 'catalog'])
    assert.deepEqual(getRoleDefaultPermissions('fulfillment'), ['dashboard', 'orders'])
    const perms = getEffectivePermissions({ role: 'fulfillment', permissions: [] })
    assert.ok(perms.has('orders'))
    assert.equal(perms.has('staff'), false)
  })

  it('honors explicit permission overrides', () => {
    const perms = getEffectivePermissions({
      role: 'support',
      permissions: ['dashboard', 'analytics'],
    })
    assert.ok(perms.has('analytics'))
    assert.equal(perms.has('orders'), false)
  })

  it('sanitizes unknown permission keys', () => {
    assert.deepEqual(sanitizePermissions(['orders', 'invalid', 'STAFF']), ['orders', 'staff'])
  })
})
