const Product = require('../../Models/Product')

/** Auto-publish products whose scheduled time has passed. */
async function publishDueProducts() {
  const now = new Date()
  await Product.updateMany(
    {
      published: false,
      publishAt: { $ne: null, $lte: now },
    },
    { $set: { published: true, publishAt: null } }
  )
}

module.exports = { publishDueProducts }
