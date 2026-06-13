/**
 * Short public cache for read-heavy storefront GET responses.
 * @param {number} [maxAgeSeconds=60]
 */
function cachePublic(maxAgeSeconds = 60) {
  const maxAge = Math.max(0, Number(maxAgeSeconds) || 60)
  const stale = maxAge * 2
  return (_req, res, next) => {
    res.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${stale}`)
    next()
  }
}

module.exports = { cachePublic }
