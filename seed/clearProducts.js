require('dotenv').config()
const mongoose = require('mongoose')
const { connectDb } = require('../DB/connection')
const Product = require('../Models/Product')
const Review = require('../Models/Review')
const SiteSettings = require('../Models/SiteSettings')
const Collection = require('../Models/Collection')
const StockMovement = require('../Models/StockMovement')

async function clearAllProducts() {
  await connectDb()

  const productResult = await Product.deleteMany({})
  const reviewResult = await Review.deleteMany({})
  const stockResult = await StockMovement.deleteMany({})

  const settings = await SiteSettings.findOne()
  if (settings) {
    settings.newArrivalProductIds = []
    settings.featuredProductIds = []
    await settings.save()
  }

  const collections = await Collection.find()
  for (const col of collections) {
    col.productIds = []
    await col.save()
  }

  console.log(`Deleted ${productResult.deletedCount} product(s)`)
  console.log(`Deleted ${reviewResult.deletedCount} review(s)`)
  console.log(`Deleted ${stockResult.deletedCount} stock movement(s)`)
  console.log('Cleared product IDs from site settings and collections')
}

clearAllProducts()
  .then(async () => {
    await mongoose.disconnect()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await mongoose.disconnect()
    } catch {
      // ignore
    }
    process.exit(1)
  })
