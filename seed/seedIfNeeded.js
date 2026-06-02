const bcrypt = require('bcryptjs')
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
  const password = process.env.ADMIN_PASSWORD || 'admin123'

  if ((await Admin.countDocuments()) === 0) {
    const passwordHash = await bcrypt.hash(password, 10)
    await Admin.create({ email, passwordHash })
    console.log('Seeded admin user:', email)
  }

  let settings = await SiteSettings.findOne()
  if (!settings) {
    settings = await SiteSettings.create({
      categories: [...DEFAULT_CATEGORIES],
      newArrivalProductIds: [],
      shippingFee: Number(process.env.SHIPPING_FEE || 99),
      freeShippingThreshold: Number(process.env.FREE_SHIPPING_THRESHOLD || 2999),
    })
    console.log('Seeded site settings')
  }

  // Keep production startup deterministic: no sample products, customers, or orders.
  if (settings.newArrivalProductIds.length > 0) {
    settings.newArrivalProductIds = []
    await settings.save()
  }
}

module.exports = seedIfNeeded
