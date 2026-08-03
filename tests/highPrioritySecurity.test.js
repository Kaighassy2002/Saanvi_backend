const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { timingSafeEqualString, sha256Hex, randomToken } = require('../Controller/helpers/cryptoSafe')
const { hashRefreshToken, refreshEnabled } = require('../Controller/helpers/refreshTokens')
const { customerTokenExpiresIn, adminTokenExpiresIn } = require('../config/jwtSecrets')

describe('cryptoSafe timing-safe compare', () => {
  it('matches equal strings and rejects mismatches', () => {
    assert.equal(timingSafeEqualString('abcd', 'abcd'), true)
    assert.equal(timingSafeEqualString('abcd', 'abce'), false)
    assert.equal(timingSafeEqualString('ab', 'abcd'), false)
  })

  it('hashes refresh tokens consistently', () => {
    const raw = randomToken(16)
    assert.equal(hashRefreshToken(raw), sha256Hex(raw))
    assert.notEqual(hashRefreshToken(raw), raw)
  })
})

describe('refresh token defaults', () => {
  it('uses short access TTLs when refresh is enabled', () => {
    const prev = {
      REFRESH_TOKENS_ENABLED: process.env.REFRESH_TOKENS_ENABLED,
      JWT_CUSTOMER_EXPIRES_IN: process.env.JWT_CUSTOMER_EXPIRES_IN,
      JWT_ADMIN_EXPIRES_IN: process.env.JWT_ADMIN_EXPIRES_IN,
    }
    try {
      process.env.REFRESH_TOKENS_ENABLED = 'true'
      delete process.env.JWT_CUSTOMER_EXPIRES_IN
      delete process.env.JWT_ADMIN_EXPIRES_IN
      assert.equal(refreshEnabled(), true)
      assert.equal(customerTokenExpiresIn(), '15m')
      assert.equal(adminTokenExpiresIn(), '15m')
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })
})
