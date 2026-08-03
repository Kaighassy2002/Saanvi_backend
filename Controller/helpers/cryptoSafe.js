const crypto = require('crypto')

/** Timing-safe string compare (rejects unequal lengths without leaking). */
function timingSafeEqualString(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (!left || !right || left.length !== right.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
  } catch {
    return false
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')
}

module.exports = {
  timingSafeEqualString,
  randomToken,
  sha256Hex,
}
