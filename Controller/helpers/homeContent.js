const DEFAULT_HOME_SECTIONS = {
  serviceBarStrip: 'Complimentary shipping over {{threshold}} - trusted quality guaranteed',
  promo: { overline: 'Curated offers', title: 'Signature savings' },
  trending: {
    overline: 'Most loved picks',
    title: 'Trending Products',
    viewAllLabel: 'View all products',
    tabs: [
      { id: 'featured', label: 'Featured' },
      { id: 'new', label: 'New Arrivals' },
      { id: 'bestseller', label: 'Best Seller' },
    ],
  },
  categories: {
    overline: 'Shop by mood',
    title: 'Popular Categories',
    buttonLabel: 'Shop all categories',
    buttonLink: '/collections',
  },
  mobilePromos: { title: 'Offers for you', linkLabel: 'See all', linkUrl: '/collections' },
  mobileTrending: { title: 'Trending now', linkLabel: 'View all' },
  mobileCategories: {
    title: 'Shop by category',
    linkLabel: 'All',
    linkUrl: '/collections',
    ctaTitle: 'Discover handcrafted jewellery',
    ctaText: 'Bridal, festive, and everyday pieces curated for you.',
    ctaButtonLabel: 'Explore collections',
    ctaButtonLink: '/collections',
  },
  mobileQuickShop: {
    searchPlaceholder: 'Search necklaces, rings, bridal sets…',
    chips: [{ label: 'New arrivals', link: '/collections?sort=latest', highlight: true }],
  },
}

const DEFAULT_PROMO_BANNERS = [
  {
    label: 'Flat 30% off',
    title: 'Glowing gold rings',
    image: '',
    link: '/collections?category=Ring',
    buttonText: 'Shop now',
  },
  {
    label: 'Special offers',
    title: 'Women gold bracelet',
    image: '',
    link: '/collections?category=Bracelets',
    buttonText: 'Shop now',
  },
  {
    label: 'Flat 20% off',
    title: 'Trendy bridal sets',
    image: '',
    link: '/collections?category=Bridal%20Set',
    buttonText: 'Shop now',
  },
]

const DEFAULT_HOME_SERVICES = [
  { icon: 'fa-paper-plane', title: 'Free Shipping', text: 'On orders over {{threshold}}' },
  { icon: 'fa-arrow-rotate-left', title: 'Easy Returns', text: '7-day returns' },
  { icon: 'fa-wallet', title: 'Secure Pay', text: 'COD available' },
  { icon: 'fa-headset', title: 'Support', text: 'WhatsApp help' },
]

function hasContent(item, fields) {
  if (!item || typeof item !== 'object') return false
  return fields.some((f) => String(item[f] || '').trim())
}

function sanitizePromoBanners(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((b) => ({
      label: String(b?.label || '').trim(),
      title: String(b?.title || '').trim(),
      image: String(b?.image || '').trim(),
      link: String(b?.link || '').trim() || '/collections',
      buttonText: String(b?.buttonText || '').trim() || 'Shop now',
    }))
    .filter((b) => hasContent(b, ['image', 'title']))
}

function sanitizeHomeServices(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((s) => ({
      icon: String(s?.icon || 'fa-paper-plane').trim() || 'fa-paper-plane',
      title: String(s?.title || '').trim(),
      text: String(s?.text || '').trim(),
    }))
    .filter((s) => hasContent(s, ['title', 'text']))
}

function sanitizeHomeSections(input) {
  const base = DEFAULT_HOME_SECTIONS
  const src = input && typeof input === 'object' ? input : {}
  const merge = (defaults, patch) => ({ ...defaults, ...(patch && typeof patch === 'object' ? patch : {}) })

  const trending = merge(base.trending, src.trending)
  const tabs = Array.isArray(src.trending?.tabs) && src.trending.tabs.length
    ? src.trending.tabs
        .map((t) => ({
          id: ['featured', 'new', 'bestseller'].includes(String(t?.id)) ? String(t.id) : 'featured',
          label: String(t?.label || '').trim(),
        }))
        .filter((t) => t.label)
    : base.trending.tabs

  const quickShop = merge(base.mobileQuickShop, src.mobileQuickShop)
  const chips = Array.isArray(src.mobileQuickShop?.chips)
    ? src.mobileQuickShop.chips
        .map((c) => ({
          label: String(c?.label || '').trim(),
          link: String(c?.link || '').trim() || '/collections',
          highlight: !!c?.highlight,
        }))
        .filter((c) => c.label)
    : base.mobileQuickShop.chips

  return {
    serviceBarStrip: String(src.serviceBarStrip ?? base.serviceBarStrip).trim() || base.serviceBarStrip,
    promo: merge(base.promo, src.promo),
    trending: { ...trending, tabs: tabs.length ? tabs : base.trending.tabs },
    categories: merge(base.categories, src.categories),
    mobilePromos: merge(base.mobilePromos, src.mobilePromos),
    mobileTrending: merge(base.mobileTrending, src.mobileTrending),
    mobileCategories: merge(base.mobileCategories, src.mobileCategories),
    mobileQuickShop: { ...quickShop, chips },
  }
}

function resolvePromoBanners(stored, fallback = DEFAULT_PROMO_BANNERS) {
  const fromDb = sanitizePromoBanners(stored)
  if (fromDb.length) return fromDb
  return fallback.map((b) => ({
    label: b.label || '',
    title: b.title || '',
    image: b.image || '',
    link: b.link || '/collections',
    buttonText: b.buttonText || 'Shop now',
  }))
}

function resolveHomeServices(stored, fallback = DEFAULT_HOME_SERVICES) {
  const fromDb = sanitizeHomeServices(stored)
  if (fromDb.length) return fromDb
  return fallback.map((s) => ({ ...s }))
}

function resolveHomeSections(stored) {
  const sanitized = sanitizeHomeSections(stored)
  const hasAny =
    stored &&
    typeof stored === 'object' &&
    Object.keys(stored).length > 0
  return hasAny ? sanitized : DEFAULT_HOME_SECTIONS
}

module.exports = {
  DEFAULT_HOME_SECTIONS,
  DEFAULT_PROMO_BANNERS,
  DEFAULT_HOME_SERVICES,
  sanitizePromoBanners,
  sanitizeHomeServices,
  sanitizeHomeSections,
  resolvePromoBanners,
  resolveHomeServices,
  resolveHomeSections,
}
