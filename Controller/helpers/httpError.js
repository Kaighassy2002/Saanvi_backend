const { isProduction } = require('../../config/isProduction')

function clientErrorMessage(err, fallback = 'Server error') {
  if (!err) return fallback
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return err.message || fallback
  }
  if (!isProduction()) {
    return err.message || fallback
  }
  return fallback
}

module.exports = { clientErrorMessage }
