const { isProduction } = require('../../config/isProduction')

function baseFields(extra = {}) {
  return {
    ts: new Date().toISOString(),
    service: 'jewellery-api',
    env: process.env.NODE_ENV || 'development',
    ...extra,
  }
}

function log(level, message, extra = {}) {
  const payload = baseFields({ level, msg: message, ...extra })
  const line = isProduction() ? JSON.stringify(payload) : `[${level}] ${message}`
  if (level === 'error') {
    if (isProduction()) console.error(line)
    else console.error(line, extra)
    return
  }
  if (level === 'warn') {
    console.warn(isProduction() ? line : `${line} ${JSON.stringify(extra)}`)
    return
  }
  console.log(isProduction() ? line : line)
}

module.exports = {
  info: (msg, extra) => log('info', msg, extra),
  warn: (msg, extra) => log('warn', msg, extra),
  error: (msg, extra) => log('error', msg, extra),
}
