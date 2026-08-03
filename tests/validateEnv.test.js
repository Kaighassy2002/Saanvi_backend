const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { validateEnv } = require('../config/validateEnv')

function withEnv(overrides, fn) {
  const prev = {}
  for (const key of Object.keys(overrides)) {
    prev[key] = process.env[key]
    if (overrides[key] === undefined) delete process.env[key]
    else process.env[key] = overrides[key]
  }
  try {
    fn()
  } finally {
    for (const key of Object.keys(overrides)) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  }
}

const strongProdBase = {
  NODE_ENV: 'production',
  CONNECTION_STRING: 'mongodb+srv://example',
  JWT_SECRET: 'a'.repeat(48),
  CORS_ALLOWED_ORIGINS: 'https://shop.example.com',
  ADMIN_PASSWORD: 'Str0ng!UniquePass2026',
  RAZORPAY_KEY_ID: 'rzp_test_xxx',
  RAZORPAY_KEY_SECRET: 'rzp_test_secret',
}

describe('validateEnv', () => {
  it('requires CONNECTION_STRING and JWT_SECRET', () => {
    withEnv(
      {
        CONNECTION_STRING: '',
        JWT_SECRET: '',
        JWT_CUSTOMER_SECRET: '',
        NODE_ENV: 'development',
      },
      () => {
        const result = validateEnv()
        assert.equal(result.ok, false)
        assert.ok(result.errors.some((e) => e.includes('CONNECTION_STRING')))
        assert.ok(result.errors.some((e) => e.includes('JWT_SECRET')))
      }
    )
  })

  it('blocks weak production secrets', () => {
    withEnv(
      {
        NODE_ENV: 'production',
        CONNECTION_STRING: 'mongodb+srv://example',
        JWT_SECRET: 'jewellery-dev-secret-change-in-production',
        CORS_ALLOWED_ORIGINS: 'https://shop.example.com',
        ADMIN_PASSWORD: 'admin123',
        RAZORPAY_KEY_ID: 'rzp_test',
        RAZORPAY_KEY_SECRET: 'secret',
      },
      () => {
        const result = validateEnv()
        assert.equal(result.ok, false)
        assert.ok(result.errors.some((e) => e.includes('JWT_SECRET')))
        assert.ok(result.errors.some((e) => e.includes('ADMIN_PASSWORD')))
      }
    )
  })

  it('requires Razorpay in production unless explicitly disabled', () => {
    withEnv(
      {
        ...strongProdBase,
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
      },
      () => {
        const result = validateEnv()
        assert.equal(result.ok, false)
        assert.ok(result.errors.some((e) => e.includes('RAZORPAY')))
      }
    )
  })

  it('allows COD-only production when REQUIRE_ONLINE_PAYMENTS=false', () => {
    withEnv(
      {
        ...strongProdBase,
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        REQUIRE_ONLINE_PAYMENTS: 'false',
      },
      () => {
        const result = validateEnv()
        assert.equal(result.ok, true)
      }
    )
  })

  it('passes with strong production config', () => {
    withEnv(strongProdBase, () => {
      const result = validateEnv()
      assert.equal(result.ok, true)
    })
  })
})
