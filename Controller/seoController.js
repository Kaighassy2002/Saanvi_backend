const Product = require('../Models/Product')
const { publishDueProducts } = require('./helpers/scheduledPublish')

function storefrontBaseUrl() {
  const raw =
    String(process.env.STOREFRONT_URL || process.env.PUBLIC_STOREFRONT_URL || '').trim() ||
    String(process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((v) => v.trim())
      .find(Boolean) ||
    'https://www.aashmikadesigns.com'
  return raw.replace(/\/$/, '')
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function urlEntry(loc, { changefreq = 'weekly', priority = '0.5', lastmod } = {}) {
  const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ''
  return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmodTag}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

function toLastmod(date) {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

async function getSitemapXml(_req, res) {
  await publishDueProducts()
  const base = storefrontBaseUrl()

  const staticPages = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/collections', changefreq: 'daily', priority: '0.9' },
    { path: '/contact', changefreq: 'monthly', priority: '0.6' },
    { path: '/shipping', changefreq: 'monthly', priority: '0.5' },
    { path: '/returns', changefreq: 'monthly', priority: '0.5' },
    { path: '/privacy-policy', changefreq: 'yearly', priority: '0.4' },
  ]

  const products = await Product.find({ published: true })
    .select({ updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1 })
    .lean()

  const entries = [
    ...staticPages.map((page) => urlEntry(`${base}${page.path}`, page)),
    ...products.map((doc) =>
      urlEntry(`${base}/product/${String(doc._id)}`, {
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: toLastmod(doc.updatedAt || doc.createdAt),
      })
    ),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`

  res.set('Content-Type', 'application/xml; charset=utf-8')
  res.send(xml)
}

module.exports = { getSitemapXml, storefrontBaseUrl }
