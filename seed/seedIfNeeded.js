const bcrypt = require('bcryptjs')
const { isProduction } = require('../config/isProduction')
const Admin = require('../Models/Admin')
const SiteSettings = require('../Models/SiteSettings')

const DEFAULT_CATEGORIES = [
  'Necklace',
  'Earrings',
  'Ring',
  'Bracelets',
  'Anklet',
  'Bangles',
  'Bridal Set',
]

async function seedIfNeeded() {
  const email = (process.env.ADMIN_EMAIL || 'admin@jewellery.com').toLowerCase().trim()
  const password = process.env.ADMIN_PASSWORD

  if (isProduction()) {
    if (!password || password === 'admin123') {
      throw new Error(
        'ADMIN_PASSWORD must be set to a strong password before production startup (not admin123)'
      )
    }
  }

  const effectivePassword = password || 'admin123'

  if ((await Admin.countDocuments()) === 0) {
    const passwordHash = await bcrypt.hash(effectivePassword, 10)
    await Admin.create({ email, passwordHash })
    if (!isProduction()) {
      console.log('Seeded admin user:', email)
    } else {
      console.log('Seeded admin user for first production run:', email)
    }
  }

  let settings = await SiteSettings.findOne()
  if (!settings) {
    settings = await SiteSettings.create({
      categories: [...DEFAULT_CATEGORIES],
      newArrivalProductIds: [],
      shippingFee: Number(process.env.SHIPPING_FEE || 99),
      freeShippingThreshold: Number(process.env.FREE_SHIPPING_THRESHOLD || 2999),
    })
    if (!isProduction()) {
      console.log('Seeded site settings')
    }
  }
}

module.exports = seedIfNeeded
