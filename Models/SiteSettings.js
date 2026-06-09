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

const promoBannerSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    title: { type: String, default: '' },
    image: { type: String, default: '' },
    link: { type: String, default: '' },
    buttonText: { type: String, default: 'Shop now' },
  },
  { _id: false }
)

const homeServiceSchema = new mongoose.Schema(
  {
    icon: { type: String, default: 'fa-paper-plane' },
    title: { type: String, default: '' },
    text: { type: String, default: '' },
  },
  { _id: false }
)

const trendingTabSchema = new mongoose.Schema(
  {
    id: { type: String, default: 'featured' },
    label: { type: String, default: '' },
  },
  { _id: false }
)

const quickChipSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    link: { type: String, default: '' },
    highlight: { type: Boolean, default: false },
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
  promoBanners: { type: [promoBannerSchema], default: [] },
  homeServices: { type: [homeServiceSchema], default: [] },
  /** Section headings, CTAs, mobile copy — see homeMerchandising defaults */
  homeSections: { type: mongoose.Schema.Types.Mixed, default: {} },
  storeName: { type: String, default: '' },
  supportEmail: { type: String, default: '' },
  supportPhone: { type: String, default: '' },
  storeLocation: { type: String, default: '' },
  storeState: { type: String, default: '' },
  storeGstin: { type: String, default: '' },
  defaultGstPercent: { type: Number, default: 3 },
  defaultHsnCode: { type: String, default: '7113' },
  /** COD orders at or above this total require admin confirmation before packing */
  codConfirmThreshold: { type: Number, default: 10000 },
  /** Allow cash-on-delivery at checkout */
  codEnabled: { type: Boolean, default: true },
  /** WhatsApp digits with country code, e.g. 919876543210 */
  whatsappPhone: { type: String, default: '' },
  /** Top announcement bar — empty uses default free-shipping message */
  announcementMessage: { type: String, default: '' },
  instagramUrl: { type: String, default: '' },
  shippingFee: { type: Number, min: 0 },
  freeShippingThreshold: { type: Number, min: 0 },
})

module.exports = mongoose.model('SiteSettings', siteSettingsSchema)
