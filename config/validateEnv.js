const { isProduction } = require('./isProduction')

const WEAK_JWT_SECRETS = new Set([
  'jewellery-dev-secret-change-in-production',
  'change-me-to-a-long-random-string',
  'change-me',
])

const WEAK_ADMIN_PASSWORDS = new Set(['admin123', 'password', 'admin', ''])

function assertStrongSecret(name, value, errors) {
  const secret = String(value || '').trim()
  if (!secret) {
    errors.push(`${name} is required`)
    return
  }
  if (secret.length < 32) {
    errors.push(`${name} must be at least 32 characters in production`)
  } else if (WEAK_JWT_SECRETS.has(secret)) {
    errors.push(`${name} is a known weak default — generate a new one`)
  }
}

function validateEnv() {
  const errors = []
  const warnings = []

  if (!String(process.env.CONNECTION_STRING || '').trim()) {
    errors.push('CONNECTION_STRING is required')
  }

  const jwtSecret = String(process.env.JWT_SECRET || '').trim()
  const customerSecret = String(process.env.JWT_CUSTOMER_SECRET || '').trim()
  const adminSecret = String(process.env.JWT_ADMIN_SECRET || '').trim()

  if (!jwtSecret && !customerSecret) {
    errors.push('JWT_SECRET (or JWT_CUSTOMER_SECRET) is required')
  }

  if (isProduction()) {
    if (jwtSecret) assertStrongSecret('JWT_SECRET', jwtSecret, errors)
    if (customerSecret) assertStrongSecret('JWT_CUSTOMER_SECRET', customerSecret, errors)
    if (adminSecret) assertStrongSecret('JWT_ADMIN_SECRET', adminSecret, errors)

    if (!adminSecret && jwtSecret) {
      warnings.push(
        'JWT_ADMIN_SECRET is not set — admin and customer tokens share JWT_SECRET. Prefer split secrets.'
      )
    }

    if (!String(process.env.CORS_ALLOWED_ORIGINS || '').trim()) {
      errors.push('CORS_ALLOWED_ORIGINS is required in production')
    }

    const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim()
    if (!adminPassword) {
      errors.push('ADMIN_PASSWORD is required in production')
    } else if (WEAK_ADMIN_PASSWORDS.has(adminPassword)) {
      errors.push('ADMIN_PASSWORD is too weak for production')
    }

    if (!String(process.env.STOREFRONT_URL || '').trim()) {
      warnings.push('STOREFRONT_URL is not set — sitemap may use a fallback URL')
    }

    const razorpayId = String(process.env.RAZORPAY_KEY_ID || '').trim()
    const razorpaySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim()
    const paymentsRequired = String(process.env.REQUIRE_ONLINE_PAYMENTS || 'true').toLowerCase() !== 'false'
    if (paymentsRequired) {
      if (!razorpayId || !razorpaySecret) {
        errors.push(
          'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production (set REQUIRE_ONLINE_PAYMENTS=false to skip)'
        )
      }
      if (!String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim()) {
        warnings.push(
          'RAZORPAY_WEBHOOK_SECRET is not set — webhook fulfillment/reconciliation will reject signatures'
        )
      }
    }

    const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim()
    const cloudKey = String(process.env.CLOUDINARY_API_KEY || '').trim()
    const cloudSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim()
    if (!cloudName || !cloudKey || !cloudSecret) {
      warnings.push('Cloudinary credentials incomplete — admin image uploads will fail')
    }

    if (!String(process.env.REDIS_URL || '').trim()) {
      warnings.push(
        'REDIS_URL is not set — rate limits use in-memory store (not safe across multiple instances)'
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

function assertEnvValid() {
  const result = validateEnv()
  for (const warning of result.warnings) {
    console.warn(`[env] ${warning}`)
  }
  if (!result.ok) {
    console.error('[env] Startup blocked:')
    for (const err of result.errors) {
      console.error(`  - ${err}`)
    }
    process.exit(1)
  }
}

module.exports = { validateEnv, assertEnvValid, WEAK_JWT_SECRETS, WEAK_ADMIN_PASSWORDS }
