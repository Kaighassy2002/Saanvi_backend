/** Block javascript:/data: URLs in admin-controlled storefront links (stored XSS). */
function safeInternalPath(url, fallback = '/shop') {
  const s = String(url || '').trim()
  if (!s) return fallback
  if (/^(javascript|data|vbscript):/i.test(s)) return fallback
  if (s.startsWith('//')) return fallback
  if (/^https?:\/\//i.test(s)) {
    try {
      const parsed = new URL(s)
      if (!['http:', 'https:'].includes(parsed.protocol)) return fallback
      return s
    } catch {
      return fallback
    }
  }
  return s.startsWith('/') ? s : `/${s}`
}

module.exports = { safeInternalPath }
