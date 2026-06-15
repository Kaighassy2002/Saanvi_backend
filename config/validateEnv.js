const { isProduction } = require('./isProduction')

const WEAK_JWT_SECRETS = new Set([
  'jewellery-dev-secret-change-in-production',
  'change-me-to-a-long-random-string',
  'change-me',
])

const WEAK_ADMIN_PASSWORDS = new Set(['admin123', 'password', 'admin', ''])

function validateEnv() {
  const errors = []
  const warnings = []

  if (!String(process.env.CONNECTION_STRING || '').trim()) {
    errors.push('CONNECTION_STRING is required')
  }

  const jwtSecret = String(process.env.JWT_SECRET || '').trim()
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required')
  } else if (isProduction()) {
    if (jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production')
    } else if (WEAK_JWT_SECRETS.has(jwtSecret)) {
      errors.push('JWT_SECRET is a known weak default — generate a new one')
    }
  }

  if (isProduction()) {
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
