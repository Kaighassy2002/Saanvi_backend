function isProduction() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
}

module.exports = { isProduction }
