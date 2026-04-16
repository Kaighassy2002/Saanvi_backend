const SiteSettings = require('../../Models/SiteSettings')

async function getOrCreateSettings() {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({ categories: [], newArrivalProductIds: [] })
  }
  return doc
}

module.exports = { getOrCreateSettings }
