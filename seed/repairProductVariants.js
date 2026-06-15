/**
 * One-off repair: normalize corrupt product.variants in MongoDB (e.g. scalar 1 or [1]).
 * Run: node seed/repairProductVariants.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const Product = require('../Models/Product')
const {
  sanitizeVariantList,
  variantsFieldNeedsRepair,
} = require('../Controller/helpers/productVariantSanitize')

async function main() {
  const { connectDb } = require('../DB/connection')
  await connectDb()

  const cursor = Product.collection.find({}, { projection: { variants: 1, name: 1 } })
  let scanned = 0
  let repaired = 0

  for await (const doc of cursor) {
    scanned += 1
    if (!variantsFieldNeedsRepair(doc.variants)) continue
    const sanitized = sanitizeVariantList(doc.variants)
    await Product.collection.updateOne({ _id: doc._id }, { $set: { variants: sanitized } })
    repaired += 1
    console.log(`Repaired variants for product ${doc._id} (${doc.name || 'unnamed'})`)
  }

  console.log(`Done. Scanned ${scanned} products, repaired ${repaired}.`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
