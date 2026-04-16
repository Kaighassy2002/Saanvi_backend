const bcrypt = require('bcryptjs')
const Admin = require('../Models/Admin')
const Product = require('../Models/Product')
const SiteSettings = require('../Models/SiteSettings')
const Customer = require('../Models/Customer')
const Order = require('../Models/Order')

const DEFAULT_CATEGORIES = [
  'Necklace',
  'Earrings',
  'Ring',
  'Bracelets',
  'Anklet',
  'Bangles',
  'Bridal Set',
]

const SEED_PRODUCTS = [
  {
    name: 'Golden Pearl Necklace',
    category: 'Necklace',
    price: 2999,
    originalPrice: 3499,
    images: ['https://i.pinimg.com/736x/6e/0a/df/6e0adff7532f9a57c29c25a00633fcc9.jpg'],
    description: 'Elegant necklace with golden pearls.',
    published: true,
    stock: 10,
  },
  {
    name: 'Diamond Stud Earrings',
    category: 'Earrings',
    price: 1799,
    originalPrice: 1899,
    images: ['https://i.pinimg.com/736x/c4/9a/ad/c49aad90047956545db651cb5ac8b778.jpg'],
    description: 'Classic diamond studs.',
    published: true,
    stock: 15,
  },
  {
    name: 'Emerald Gold Ring',
    category: 'Ring',
    price: 1299,
    originalPrice: 1599,
    images: ['https://i.pinimg.com/1200x/38/53/66/385366988b1873a9d64e75904d4b46e6.jpg'],
    description: 'Gold ring with emerald stone.',
    published: true,
    stock: 8,
  },
  {
    name: 'Ruby Bracelet Set',
    category: 'Bracelets',
    price: 2999,
    originalPrice: 3249,
    images: ['https://i.pinimg.com/736x/dc/cc/e2/dccce2854e1e9d0191ac642b36d1aa1d.jpg'],
    description: 'Bracelet set with ruby accents.',
    published: true,
    stock: 12,
  },
  {
    name: 'Sapphire Pendant',
    category: 'Necklace',
    price: 1999,
    originalPrice: 2599,
    images: ['https://i.pinimg.com/1200x/5c/ba/18/5cba188a5e5e2d9db61ced9017350d94.jpg'],
    description: 'Sapphire pendant on gold chain.',
    published: true,
    stock: 20,
  },
  {
    name: 'Traditional Gold Bangles',
    category: 'Bangles',
    price: 2299,
    originalPrice: 3999,
    images: ['https://i.pinimg.com/1200x/6f/cb/ae/6fcbaefdec611fd2d94a8df4ee2658d7.jpg'],
    description: 'Traditional crafted gold bangles for festive wear.',
    published: true,
    stock: 14,
  },
  {
    name: 'Bridal Polki Set',
    category: 'Bridal Set',
    price: 6999,
    originalPrice: 7999,
    images: ['https://i.pinimg.com/736x/05/cb/2a/05cb2a824fa78fffe6e2203d5454fd56.jpg'],
    description: 'Regal polki bridal set for wedding occasions.',
    published: true,
    stock: 6,
  },
  {
    name: 'Temple Anklet Pair',
    category: 'Anklet',
    price: 1499,
    originalPrice: 1899,
    images: ['https://i.pinimg.com/1200x/f4/98/d2/f498d2e89d1f88d4ea2631b61365506c.jpg'],
    description: 'Temple style silver anklet pair with detailed motifs.',
    published: true,
    stock: 12,
  },
  {
    name: 'Rose Gold Charm Bracelet',
    category: 'Bracelets',
    price: 1899,
    originalPrice: 2299,
    images: ['https://i.pinimg.com/736x/7d/50/c8/7d50c8df7d331a4643cc1e0fac0f05f3.jpg'],
    description: 'Rose gold bracelet with elegant hanging charms.',
    published: true,
    stock: 16,
  },
  {
    name: 'Pearl Drop Earrings',
    category: 'Earrings',
    price: 1699,
    originalPrice: 2099,
    images: ['https://i.pinimg.com/736x/7f/15/8c/7f158c76dcf0f75f6f27cce4f72ca91d.jpg'],
    description: 'Pearl drop earrings with a graceful evening profile.',
    published: true,
    stock: 18,
  },
  {
    name: 'Antique Kundan Necklace',
    category: 'Necklace',
    price: 3599,
    originalPrice: 4299,
    images: ['https://i.pinimg.com/736x/d8/31/6c/d8316c85ee5f8f14772bca50f6ef72db.jpg'],
    description: 'Antique kundan necklace inspired by classic royal designs.',
    published: true,
    stock: 10,
  },
  {
    name: 'Minimal Gold Ring',
    category: 'Ring',
    price: 1199,
    originalPrice: 1499,
    images: ['https://i.pinimg.com/736x/c8/a7/44/c8a744af79b444f7ad4b24ed0bf2f3ab.jpg'],
    description: 'Minimal everyday ring in polished gold finish.',
    published: true,
    stock: 22,
  },
  {
    name: 'Lotus Temple Pendant',
    category: 'Necklace',
    price: 2099,
    originalPrice: 2599,
    images: ['https://i.pinimg.com/736x/df/e3/2e/dfe32e70be5b643cc0c4a4e3bf43f520.jpg'],
    description: 'Lotus-inspired temple pendant with heritage detailing.',
    published: true,
    stock: 17,
  },
  {
    name: 'Classic Hoop Earrings',
    category: 'Earrings',
    price: 1399,
    originalPrice: 1799,
    images: ['https://i.pinimg.com/736x/f6/54/4d/f6544d4cf38d09ce6f5794de12846f72.jpg'],
    description: 'Classic hoop earrings crafted for versatile styling.',
    published: true,
    stock: 24,
  },
  {
    name: 'Floral Diamond Ring',
    category: 'Ring',
    price: 2499,
    originalPrice: 2999,
    images: ['https://i.pinimg.com/736x/e8/61/7d/e8617d934ea58b2cbf838dcdc3c8e53f.jpg'],
    description: 'Floral ring with diamond-like stone setting.',
    published: true,
    stock: 11,
  },
  {
    name: 'Regal Polki Choker',
    category: 'Bridal Set',
    price: 7299,
    originalPrice: 8399,
    images: ['https://i.pinimg.com/736x/35/29/9f/35299f1be96f632bae10b328887ce59f.jpg'],
    description: 'Statement polki choker for bridal and festive ceremonies.',
    published: true,
    stock: 7,
  },
  {
    name: 'Textured Gold Bangles',
    category: 'Bangles',
    price: 2699,
    originalPrice: 3299,
    images: ['https://i.pinimg.com/736x/11/5a/e9/115ae91fffb0fdbf2e5d8970ef2f9bd9.jpg'],
    description: 'Textured bangles with handcrafted detailing.',
    published: true,
    stock: 13,
  },
  {
    name: 'Silver Charm Anklet',
    category: 'Anklet',
    price: 999,
    originalPrice: 1299,
    images: ['https://i.pinimg.com/736x/75/13/1f/75131f543147e2ff17cb54f2ee8e2ceb.jpg'],
    description: 'Lightweight silver anklet with charm accents.',
    published: true,
    stock: 19,
  },
  {
    name: 'Meenakari Statement Necklace',
    category: 'Necklace',
    price: 3899,
    originalPrice: 4699,
    images: ['https://i.pinimg.com/736x/a4/7b/f5/a47bf54e68c8fc786ca5c6ac1af2fda6.jpg'],
    description: 'Colorful meenakari statement necklace for festive looks.',
    published: true,
    stock: 9,
  },
  {
    name: 'Crystal Tear Earrings',
    category: 'Earrings',
    price: 1799,
    originalPrice: 2199,
    images: ['https://i.pinimg.com/736x/3f/c1/a7/3fc1a77f36e2e6f2204f25eecc6e8ee8.jpg'],
    description: 'Crystal tear-drop earrings with elegant shine.',
    published: true,
    stock: 16,
  },
  {
    name: 'Twin Heart Ring',
    category: 'Ring',
    price: 1299,
    originalPrice: 1699,
    images: ['https://i.pinimg.com/736x/b9/08/4c/b9084c6e306ceb70e8ef862fa8d558f7.jpg'],
    description: 'Twin-heart motif ring for gifting and daily wear.',
    published: true,
    stock: 20,
  },
  {
    name: 'Royal Bridal Haar',
    category: 'Bridal Set',
    price: 8199,
    originalPrice: 9399,
    images: ['https://i.pinimg.com/736x/3a/4a/6b/3a4a6b63d70de34c2bfca39f47f8ed44.jpg'],
    description: 'Long bridal haar necklace for traditional ceremonies.',
    published: true,
    stock: 5,
  },
  {
    name: 'Cuff Style Bracelet',
    category: 'Bracelets',
    price: 2199,
    originalPrice: 2699,
    images: ['https://i.pinimg.com/736x/87/b6/35/87b6351a4105e50f413837542f3e4e0f.jpg'],
    description: 'Modern cuff-style bracelet with bold silhouette.',
    published: true,
    stock: 14,
  },
  {
    name: 'Heritage Gold Kada',
    category: 'Bangles',
    price: 3199,
    originalPrice: 3899,
    images: ['https://i.pinimg.com/736x/ef/54/6f/ef546fd012b88d06b4bd78b76eb674f4.jpg'],
    description: 'Heritage-inspired gold kada with premium finish.',
    published: true,
    stock: 10,
  },
  {
    name: 'Moonstone Pendant Chain',
    category: 'Necklace',
    price: 2399,
    originalPrice: 2899,
    images: ['https://i.pinimg.com/736x/92/10/28/921028b1a56f4ed2bda2e5d5f3f95f44.jpg'],
    description: 'Moonstone pendant chain with soft luminous tone.',
    published: true,
    stock: 15,
  },
  {
    name: 'Emerald Stud Earrings',
    category: 'Earrings',
    price: 1999,
    originalPrice: 2499,
    images: ['https://i.pinimg.com/736x/6f/96/2d/6f962d8f0199ba3b85d607f8c4f1ac7e.jpg'],
    description: 'Emerald-colored studs with timeless finish.',
    published: true,
    stock: 18,
  },
  {
    name: 'Infinity Knot Ring',
    category: 'Ring',
    price: 1499,
    originalPrice: 1899,
    images: ['https://i.pinimg.com/736x/3a/fc/4a/3afc4a3a46267dc4ebfcb7773c8b0a67.jpg'],
    description: 'Infinity knot ring symbolizing forever bond.',
    published: true,
    stock: 21,
  },
  {
    name: 'Layered Temple Necklace',
    category: 'Bridal Set',
    price: 7499,
    originalPrice: 8699,
    images: ['https://i.pinimg.com/736x/6d/c5/57/6dc5574c6e8f70f8e8c319f03d3f648a.jpg'],
    description: 'Layered temple necklace ideal for bridal styling.',
    published: true,
    stock: 8,
  },
  {
    name: 'Pearl Line Bracelet',
    category: 'Bracelets',
    price: 1599,
    originalPrice: 1999,
    images: ['https://i.pinimg.com/736x/90/e1/b1/90e1b1d8ec5fd7116f286b18e4db4e66.jpg'],
    description: 'Delicate pearl line bracelet for subtle elegance.',
    published: true,
    stock: 17,
  },
  {
    name: 'Twisted Gold Bangles',
    category: 'Bangles',
    price: 2899,
    originalPrice: 3499,
    images: ['https://i.pinimg.com/736x/18/c6/e4/18c6e43b8cae8f4bfbc6b1d01ef4b64e.jpg'],
    description: 'Twisted design bangles with rich gold polish.',
    published: true,
    stock: 13,
  },
  {
    name: 'Beaded Silver Anklet',
    category: 'Anklet',
    price: 1099,
    originalPrice: 1399,
    images: ['https://i.pinimg.com/736x/4d/cd/67/4dcd67031f1d4ba8ac89e4fd5e6f2ec4.jpg'],
    description: 'Beaded silver anklet crafted for everyday sparkle.',
    published: true,
    stock: 19,
  },
  {
    name: 'Regal Ruby Necklace',
    category: 'Necklace',
    price: 4199,
    originalPrice: 4999,
    images: ['https://i.pinimg.com/736x/e1/f2/74/e1f2743b945f0e34fb915b7cc3c6f6e0.jpg'],
    description: 'Regal ruby necklace for festive and party looks.',
    published: true,
    stock: 7,
  },
  {
    name: 'Filigree Drop Earrings',
    category: 'Earrings',
    price: 1899,
    originalPrice: 2399,
    images: ['https://i.pinimg.com/736x/6b/42/cc/6b42cc266b4d12d97f0217ed9fd31fb4.jpg'],
    description: 'Filigree drop earrings with intricate detailing.',
    published: true,
    stock: 16,
  },
]

const SEED_CUSTOMERS = [
  {
    email: 'riya@example.com',
    name: 'Riya Sharma',
    phone: '9876543210',
    createdAt: '2024-01-02',
    disabled: false,
  },
  {
    email: 'arjun@example.com',
    name: 'Arjun Mehta',
    phone: '9123456780',
    createdAt: '2023-12-18',
    disabled: false,
  },
  {
    email: 'priya@example.com',
    name: 'Priya Nair',
    phone: '9988776655',
    createdAt: '2023-11-05',
    disabled: false,
  },
]

const SEED_ORDERS = [
  {
    publicId: 'ORD-001',
    date: '2024-01-15',
    status: 'Delivered',
    total: 49999,
    customerEmail: 'riya@example.com',
    customerName: 'Riya Sharma',
    shipping: {
      firstName: 'Riya',
      lastName: 'Sharma',
      email: 'riya@example.com',
      phone: '9876543210',
      address: '12 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    },
    paymentMethod: 'card',
    trackingNumber: '',
    internalNotes: '',
    items: [
      {
        productId: 1,
        name: 'Elegant Gold Necklace',
        quantity: 1,
        price: 49999,
        image: 'https://via.placeholder.com/100x100',
      },
    ],
  },
  {
    publicId: 'ORD-002',
    date: '2024-01-10',
    status: 'In Transit',
    total: 29998,
    customerEmail: 'arjun@example.com',
    customerName: 'Arjun Mehta',
    shipping: {
      firstName: 'Arjun',
      lastName: 'Mehta',
      email: 'arjun@example.com',
      phone: '9123456780',
      address: '45 Park Street',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700016',
    },
    paymentMethod: 'upi',
    trackingNumber: 'TRACK-77821',
    internalNotes: '',
    items: [
      {
        productId: 2,
        name: 'Silver Earrings',
        quantity: 2,
        price: 14999,
        image: 'https://via.placeholder.com/100x100',
      },
    ],
  },
  {
    publicId: 'ORD-003',
    date: '2024-01-05',
    status: 'Processing',
    total: 89999,
    customerEmail: 'priya@example.com',
    customerName: 'Priya Nair',
    shipping: {
      firstName: 'Priya',
      lastName: 'Nair',
      email: 'priya@example.com',
      phone: '9988776655',
      address: '8 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400002',
    },
    paymentMethod: 'card',
    trackingNumber: '',
    internalNotes: 'Verify hallmarked certificate before dispatch',
    items: [
      {
        productId: 3,
        name: 'Diamond Ring',
        quantity: 1,
        price: 89999,
        image: 'https://via.placeholder.com/100x100',
      },
    ],
  },
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
    })
    console.log('Seeded site settings')
  }

  const existingProducts = await Product.find().select('name')
  const existingNames = new Set(
    existingProducts.map((p) => String(p.name || '').trim().toLowerCase()).filter(Boolean)
  )
  const missingSeedProducts = SEED_PRODUCTS.filter(
    (p) => !existingNames.has(String(p.name || '').trim().toLowerCase())
  )
  if (missingSeedProducts.length > 0) {
    const inserted = await Product.insertMany(missingSeedProducts)
    console.log('Seeded products:', inserted.length)
  }

  if (settings.newArrivalProductIds.length === 0) {
    const first = await Product.find().limit(6).select('_id')
    settings.newArrivalProductIds = first.map((p) => String(p._id))
    await settings.save()
  }

  if ((await Customer.countDocuments()) === 0) {
    await Customer.insertMany(SEED_CUSTOMERS)
    console.log('Seeded customers')
  }

  if ((await Order.countDocuments()) === 0) {
    await Order.insertMany(SEED_ORDERS)
    console.log('Seeded orders')
  }
}

module.exports = seedIfNeeded
