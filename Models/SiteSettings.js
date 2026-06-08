const mongoose = require('mongoose')

const heroSlideSchema = new mongoose.Schema(
  {
    image: { type: String, default: '' },
    tag: { type: String, default: '' },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    link: { type: String, default: '' },
  },
  { _id: false }
)

const homeCategoryImageSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  { _id: false }
)

const siteSettingsSchema = new mongoose.Schema({
  categories: { type: [String], default: [] },
  newArrivalProductIds: { type: [String], default: [] },
  featuredProductIds: { type: [String], default: [] },
  featuredCollectionIds: { type: [String], default: [] },
  heroSlides: { type: [heroSlideSchema], default: [] },
  homeCategoryImages: { type: [homeCategoryImageSchema], default: [] },
  storeName: { type: String, default: '' },
  supportEmail: { type: String, default: '' },
  supportPhone: { type: String, default: '' },
  storeLocation: { type: String, default: '' },
  defaultGstPercent: { type: Number, default: 3 },
  defaultHsnCode: { type: String, default: '7113' },
  shippingFee: { type: Number, min: 0 },
  freeShippingThreshold: { type: Number, min: 0 },
})

module.exports = mongoose.model('SiteSettings', siteSettingsSchema)
