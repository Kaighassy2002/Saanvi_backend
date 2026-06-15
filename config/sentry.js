const { Sentry, isSentryEnabled } = require('../instrument')

function captureServerError(error, context = {}) {
  if (!isSentryEnabled) return
  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags)
    if (context.extra) scope.setExtras(context.extra)
    if (context.user) scope.setUser(context.user)
    Sentry.captureException(error)
  })
}

function setupExpressErrorHandler(app) {
  if (!isSentryEnabled) return
  Sentry.setupExpressErrorHandler(app)
}

module.exports = { captureServerError, setupExpressErrorHandler, isSentryEnabled }
