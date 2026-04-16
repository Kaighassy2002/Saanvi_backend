const mongoose = require('mongoose')

const siteSettingsSchema = new mongoose.Schema({
  categories: { type: [String], default: [] },
  newArrivalProductIds: { type: [String], default: [] },
})

module.exports = mongoose.model('SiteSettings', siteSettingsSchema)
