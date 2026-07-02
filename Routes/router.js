const express = require('express')
const mongoose = require('mongoose')
const { clientErrorMessage } = require('../Controller/helpers/httpError')
const { captureServerError } = require('../config/sentry')
const { requireAdmin } = require('../middleware/authAdmin')
const { requireCustomer } = require('../middleware/authCustomer')
const { asyncHandler } = require('../Controller/helpers/asyncHandler')
const productController = require('../Controller/productController')
const userController = require('../Controller/userController')
const reviewController = require('../Controller/reviewController')
const uploadController = require('../Controller/uploadController')
const settingsController = require('../Controller/settingsController')
const paymentsController = require('../Controller/paymentsController')
const dashboardController = require('../Controller/dashboardController')
const inventoryController = require('../Controller/inventoryController')
const categoryController = require('../Controller/categoryController')
const collectionController = require('../Controller/collectionController')
const analyticsController = require('../Controller/analyticsController')
const stockController = require('../Controller/stockController')
const sizeChartController = require('../Controller/sizeChartController')
const couponController = require('../Controller/couponController')
const seoController = require('../Controller/seoController')
const adminStaffController = require('../Controller/adminStaffController')
const { requirePermission } = require('../middleware/adminPermissions')
const { optionalCustomer } = require('../middleware/optionalCustomer')
const {
  authLimiter,
  forgotPasswordLimiter,
  orderLimiter,
  adminApiLimiter,
  publicApiLimiter,
} = require('../middleware/rateLimits')
const { cachePublic } = require('../middleware/cachePublic')

const router = express.Router()

router.get('/health', (_req, res) => {
  const dbOk = mongoose.connection.readyState === 1
  res.status(dbOk ? 200 : 503).json({ ok: dbOk })
})

router.get('/sitemap.xml', cachePublic(3600), publicApiLimiter, asyncHandler(seoController.getSitemapXml))

router.get('/categories', publicApiLimiter, asyncHandler(productController.listCategories))
router.get('/catalog/categories', publicApiLimiter, asyncHandler(categoryController.listPublicCategories))
router.get(
  '/products/listing',
  publicApiLimiter,
  cachePublic(30),
  asyncHandler(productController.listPublishedProductsListing)
)
router.get(
  '/products/search',
  publicApiLimiter,
  cachePublic(30),
  asyncHandler(productController.searchPublishedProducts)
)
router.get(
  '/products/featured',
  publicApiLimiter,
  cachePublic(60),
  asyncHandler(productController.listFeaturedPublishedProducts)
)
router.get(
  '/products/best-sellers',
  publicApiLimiter,
  cachePublic(60),
  asyncHandler(productController.listBestSellerPublishedProducts)
)
router.get('/products', publicApiLimiter, cachePublic(60), asyncHandler(productController.listPublishedProducts))
router.get('/products/reviews/summaries', publicApiLimiter, asyncHandler(reviewController.reviewSummaries))
router.get('/size-charts/:id', publicApiLimiter, asyncHandler(productController.getPublicSizeChart))
router.get(
  '/products/:id/related',
  publicApiLimiter,
  cachePublic(60),
  asyncHandler(productController.listRelatedPublishedProducts)
)
router.get('/products/:id', publicApiLimiter, asyncHandler(productController.getPublishedProductById))
router.get(
  '/products/:id/reviews',
  optionalCustomer,
  asyncHandler(reviewController.listProductReviews)
)
router.post(
  '/products/:id/reviews',
  requireCustomer,
  asyncHandler(reviewController.createProductReview)
)
router.get(
  '/merchandising/new-arrivals/products',
  publicApiLimiter,
  asyncHandler(productController.listPublicNewArrivalProducts)
)
router.get(
  '/merchandising/new-arrivals',
  publicApiLimiter,
  asyncHandler(productController.listPublicNewArrivalIds)
)
router.get(
  '/store-settings',
  publicApiLimiter,
  cachePublic(60),
  asyncHandler(settingsController.getPublicStoreSettings)
)
router.get('/payments/razorpay-config', publicApiLimiter, asyncHandler(paymentsController.getRazorpayConfig))

router.post('/auth/register', authLimiter, asyncHandler(userController.customerRegister))
router.post('/auth/login', authLimiter, asyncHandler(userController.customerLogin))
router.post('/auth/logout', asyncHandler(userController.customerLogout))
router.post('/auth/google', authLimiter, asyncHandler(userController.customerGoogleLogin))
router.post('/auth/forgot-password/request', forgotPasswordLimiter, asyncHandler(userController.customerForgotPasswordRequest))
router.post('/auth/forgot-password/verify', forgotPasswordLimiter, asyncHandler(userController.customerForgotPasswordVerifyOtp))
router.post('/auth/forgot-password/reset', forgotPasswordLimiter, asyncHandler(userController.customerForgotPasswordReset))
router.get('/auth/me', requireCustomer, asyncHandler(userController.customerGetMe))
router.patch('/auth/me', requireCustomer, asyncHandler(userController.customerUpdateMe))
router.get('/auth/cart', requireCustomer, asyncHandler(userController.customerGetCart))
router.put('/auth/cart', requireCustomer, asyncHandler(userController.customerPutCart))
router.get('/auth/wishlist', requireCustomer, asyncHandler(userController.customerGetWishlist))
router.put('/auth/wishlist', requireCustomer, asyncHandler(userController.customerPutWishlist))
router.get('/auth/orders', requireCustomer, asyncHandler(userController.customerListOrders))
router.get('/auth/orders/:id', requireCustomer, asyncHandler(userController.customerGetOrder))
router.post('/auth/orders/:id/cancel-request', requireCustomer, asyncHandler(userController.customerRequestCancel))
router.post('/auth/orders/:id/return-request', requireCustomer, asyncHandler(userController.customerRequestReturn))
router.post('/auth/orders/:id/items/:lineId/cancel', requireCustomer, asyncHandler(userController.customerCancelLineItem))
router.post('/auth/orders/:id/items/:lineId/return-request', requireCustomer, asyncHandler(userController.customerReturnLineItem))

router.post('/orders/quote', orderLimiter, requireCustomer, asyncHandler(userController.customerQuoteCheckout))
router.post('/orders', orderLimiter, requireCustomer, asyncHandler(userController.customerPlaceOrder))
router.post('/orders/razorpay-order', orderLimiter, requireCustomer, asyncHandler(userController.createRazorpayOrder))
router.post('/orders/razorpay-verify', orderLimiter, requireCustomer, asyncHandler(userController.verifyRazorpayPayment))

router.post('/coupons/quote', orderLimiter, requireCustomer, asyncHandler(couponController.storefrontQuoteCoupon))

router.post('/admin/auth/login', authLimiter, asyncHandler(userController.adminLogin))

const admin = express.Router()
admin.use(adminApiLimiter)
admin.use(requireAdmin)

const perm = {
  dashboard: requirePermission('dashboard'),
  orders: requirePermission('orders'),
  catalog: requirePermission('catalog'),
  customers: requirePermission('customers'),
  marketing: requirePermission('marketing'),
  analytics: requirePermission('analytics'),
  settings: requirePermission('settings'),
  staff: requirePermission('staff'),
}

admin.get('/auth/me', asyncHandler(userController.adminGetMe))
admin.post('/auth/logout', asyncHandler(userController.adminLogout))
admin.patch('/auth/password', asyncHandler(userController.adminChangePassword))

admin.get('/staff/permissions-meta', perm.staff, asyncHandler(adminStaffController.adminGetPermissionsMeta))
admin.get('/staff', perm.staff, asyncHandler(adminStaffController.adminListStaff))
admin.post('/staff', perm.staff, asyncHandler(adminStaffController.adminCreateStaff))
admin.patch('/staff/:id', perm.staff, asyncHandler(adminStaffController.adminUpdateStaff))
admin.delete('/staff/:id', perm.staff, asyncHandler(adminStaffController.adminDeleteStaff))

admin.get('/upload/cloudinary-signature', perm.catalog, asyncHandler(uploadController.adminGetCloudinarySignature))

admin.get('/dashboard/summary', perm.dashboard, asyncHandler(dashboardController.adminDashboardSummary))

admin.get('/products', perm.catalog, asyncHandler(productController.adminListProducts))
admin.get('/products/export', perm.catalog, asyncHandler(productController.adminExportProducts))
admin.post('/products/import', perm.catalog, asyncHandler(productController.adminImportProducts))
admin.patch('/products/bulk', perm.catalog, asyncHandler(productController.adminBulkProducts))
admin.post('/products/:id/duplicate', perm.catalog, asyncHandler(productController.adminDuplicateProduct))
admin.get('/products/:id', perm.catalog, asyncHandler(productController.adminGetProduct))
admin.post('/products', perm.catalog, asyncHandler(productController.adminCreateProduct))
admin.patch('/products/:id', perm.catalog, asyncHandler(productController.adminUpdateProduct))
admin.delete('/products/:id', perm.catalog, asyncHandler(productController.adminDeleteProduct))

admin.get('/inventory/stock', perm.catalog, asyncHandler(inventoryController.adminAllStock))
admin.get('/inventory/low-stock', perm.catalog, asyncHandler(inventoryController.adminLowStock))
admin.post('/inventory/adjust', perm.catalog, asyncHandler(stockController.adminAdjustStock))
admin.post('/inventory/stock-take', perm.catalog, asyncHandler(stockController.adminStockTake))
admin.get('/inventory/movements', perm.catalog, asyncHandler(stockController.adminStockMovements))

admin.get('/catalog/categories', perm.catalog, asyncHandler(categoryController.adminListCategories))
admin.post('/catalog/categories', perm.catalog, asyncHandler(categoryController.adminCreateCategory))
admin.patch('/catalog/categories/:id', perm.catalog, asyncHandler(categoryController.adminUpdateCategory))
admin.delete('/catalog/categories/:id', perm.catalog, asyncHandler(categoryController.adminDeleteCategory))

admin.get('/catalog/collections', perm.catalog, asyncHandler(collectionController.adminListCollections))
admin.post('/catalog/collections', perm.catalog, asyncHandler(collectionController.adminCreateCollection))
admin.patch('/catalog/collections/:id', perm.catalog, asyncHandler(collectionController.adminUpdateCollection))
admin.delete('/catalog/collections/:id', perm.catalog, asyncHandler(collectionController.adminDeleteCollection))

admin.get('/categories', perm.catalog, asyncHandler(productController.adminListCategories))
admin.put('/categories', perm.catalog, asyncHandler(productController.adminReplaceCategories))

admin.get('/merchandising/new-arrivals', perm.marketing, asyncHandler(productController.adminListNewArrivalIds))
admin.put('/merchandising/new-arrivals', perm.marketing, asyncHandler(productController.adminSaveNewArrivalIds))

admin.get('/settings', perm.settings, asyncHandler(settingsController.adminGetSettings))
admin.put('/settings', perm.settings, asyncHandler(settingsController.adminUpdateSettings))
admin.get('/settings/integrations', perm.settings, asyncHandler(settingsController.adminGetIntegrationsHealth))
admin.get('/shipping', perm.settings, asyncHandler(settingsController.adminGetShipping))
admin.put('/shipping', perm.settings, asyncHandler(settingsController.adminUpdateShipping))

admin.get('/analytics/sales', perm.analytics, asyncHandler(analyticsController.adminSalesAnalytics))
admin.get('/analytics/products', perm.analytics, asyncHandler(analyticsController.adminProductAnalytics))

admin.get('/orders/export', perm.orders, asyncHandler(userController.adminExportOrders))
admin.get('/orders/courier-status', perm.orders, asyncHandler(userController.adminGetCourierStatus))
admin.patch('/orders/bulk', perm.orders, asyncHandler(userController.adminBulkOrders))
admin.get('/orders', perm.orders, asyncHandler(userController.adminListOrders))
admin.get('/orders/:id/invoice', perm.orders, asyncHandler(userController.adminGetOrderInvoice))
admin.post('/orders/:id/confirm-cod', perm.orders, asyncHandler(userController.adminConfirmCod))
admin.post('/orders/:id/refund', perm.orders, asyncHandler(userController.adminProcessRefund))
admin.post('/orders/:id/rma', perm.orders, asyncHandler(userController.adminRmaAction))
admin.post('/orders/:id/items/:lineId/cancel', perm.orders, asyncHandler(userController.adminCancelLineItem))
admin.post('/orders/:id/items/:lineId/rma', perm.orders, asyncHandler(userController.adminLineRmaAction))
admin.post('/orders/:id/courier/awb', perm.orders, asyncHandler(userController.adminGenerateCourierAwb))
admin.get('/orders/:id', perm.orders, asyncHandler(userController.adminGetOrder))
admin.patch('/orders/:id', perm.orders, asyncHandler(userController.adminPatchOrder))

admin.get('/users', perm.customers, asyncHandler(userController.adminListUsers))
admin.get('/users/:id', perm.customers, asyncHandler(userController.adminGetUser))
admin.patch('/users/:id', perm.customers, asyncHandler(userController.adminPatchUser))
admin.patch('/users/:id/disabled', perm.customers, asyncHandler(userController.adminPatchUserDisabled))

admin.get('/size-charts', perm.catalog, asyncHandler(sizeChartController.adminListSizeCharts))
admin.post('/size-charts', perm.catalog, asyncHandler(sizeChartController.adminCreateSizeChart))
admin.patch('/size-charts/:id', perm.catalog, asyncHandler(sizeChartController.adminUpdateSizeChart))
admin.delete('/size-charts/:id', perm.catalog, asyncHandler(sizeChartController.adminDeleteSizeChart))

admin.get('/coupons', perm.marketing, asyncHandler(couponController.adminListCoupons))
admin.post('/coupons', perm.marketing, asyncHandler(couponController.adminCreateCoupon))
admin.patch('/coupons/:id', perm.marketing, asyncHandler(couponController.adminUpdateCoupon))
admin.delete('/coupons/:id', perm.marketing, asyncHandler(couponController.adminDeleteCoupon))

admin.get('/reviews', perm.marketing, asyncHandler(reviewController.adminListReviews))
admin.patch('/reviews/bulk', perm.marketing, asyncHandler(reviewController.adminBulkReviews))
admin.patch('/reviews/:id', perm.marketing, asyncHandler(reviewController.adminPatchReview))
admin.delete('/reviews/:id', perm.marketing, asyncHandler(reviewController.adminDeleteReview))

router.use('/admin', admin)

router.use((err, _req, res, _next) => {
  console.error(err)
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message })
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id' })
  }
  captureServerError(err, { tags: { source: 'api-router' } })
  res.status(500).json({ message: clientErrorMessage(err) })
})

module.exports = router
