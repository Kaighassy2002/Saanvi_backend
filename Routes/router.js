const express = require('express')
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
const { optionalCustomer } = require('../middleware/optionalCustomer')
const { authLimiter, forgotPasswordLimiter, orderLimiter } = require('../middleware/rateLimits')
const { cachePublic } = require('../middleware/cachePublic')

const router = express.Router()

router.get('/health', (_req, res) => {
  res.json({ ok: true })
})

router.get('/sitemap.xml', cachePublic(3600), asyncHandler(seoController.getSitemapXml))

router.get('/categories', asyncHandler(productController.listCategories))
router.get('/catalog/categories', asyncHandler(categoryController.listPublicCategories))
router.get('/products/listing', cachePublic(30), asyncHandler(productController.listPublishedProductsListing))
router.get('/products', cachePublic(60), asyncHandler(productController.listPublishedProducts))
router.get('/products/reviews/summaries', asyncHandler(reviewController.reviewSummaries))
router.get('/size-charts/:id', asyncHandler(productController.getPublicSizeChart))
router.get('/products/:id', asyncHandler(productController.getPublishedProductById))
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
router.get('/merchandising/new-arrivals/products', asyncHandler(productController.listPublicNewArrivalProducts))
router.get('/merchandising/new-arrivals', asyncHandler(productController.listPublicNewArrivalIds))
router.get('/store-settings', cachePublic(60), asyncHandler(settingsController.getPublicStoreSettings))
router.get('/payments/razorpay-config', asyncHandler(paymentsController.getRazorpayConfig))

router.post('/auth/register', authLimiter, asyncHandler(userController.customerRegister))
router.post('/auth/login', authLimiter, asyncHandler(userController.customerLogin))
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

router.post('/orders', orderLimiter, requireCustomer, asyncHandler(userController.customerPlaceOrder))
router.post('/orders/razorpay-order', orderLimiter, requireCustomer, asyncHandler(userController.createRazorpayOrder))
router.post('/orders/razorpay-verify', orderLimiter, requireCustomer, asyncHandler(userController.verifyRazorpayPayment))

router.post('/admin/auth/login', authLimiter, asyncHandler(userController.adminLogin))

const admin = express.Router()
admin.use(requireAdmin)

admin.get('/upload/cloudinary-signature', asyncHandler(uploadController.adminGetCloudinarySignature))

admin.get('/dashboard/summary', asyncHandler(dashboardController.adminDashboardSummary))

admin.get('/products', asyncHandler(productController.adminListProducts))
admin.get('/products/export', asyncHandler(productController.adminExportProducts))
admin.post('/products/import', asyncHandler(productController.adminImportProducts))
admin.patch('/products/bulk', asyncHandler(productController.adminBulkProducts))
admin.post('/products/:id/duplicate', asyncHandler(productController.adminDuplicateProduct))
admin.get('/products/:id', asyncHandler(productController.adminGetProduct))
admin.post('/products', asyncHandler(productController.adminCreateProduct))
admin.patch('/products/:id', asyncHandler(productController.adminUpdateProduct))
admin.delete('/products/:id', asyncHandler(productController.adminDeleteProduct))

admin.get('/inventory/stock', asyncHandler(inventoryController.adminAllStock))
admin.get('/inventory/low-stock', asyncHandler(inventoryController.adminLowStock))
admin.post('/inventory/adjust', asyncHandler(stockController.adminAdjustStock))
admin.post('/inventory/stock-take', asyncHandler(stockController.adminStockTake))
admin.get('/inventory/movements', asyncHandler(stockController.adminStockMovements))

admin.get('/catalog/categories', asyncHandler(categoryController.adminListCategories))
admin.post('/catalog/categories', asyncHandler(categoryController.adminCreateCategory))
admin.patch('/catalog/categories/:id', asyncHandler(categoryController.adminUpdateCategory))
admin.delete('/catalog/categories/:id', asyncHandler(categoryController.adminDeleteCategory))

admin.get('/catalog/collections', asyncHandler(collectionController.adminListCollections))
admin.post('/catalog/collections', asyncHandler(collectionController.adminCreateCollection))
admin.patch('/catalog/collections/:id', asyncHandler(collectionController.adminUpdateCollection))
admin.delete('/catalog/collections/:id', asyncHandler(collectionController.adminDeleteCollection))

admin.get('/categories', asyncHandler(productController.adminListCategories))
admin.put('/categories', asyncHandler(productController.adminReplaceCategories))

admin.get('/merchandising/new-arrivals', asyncHandler(productController.adminListNewArrivalIds))
admin.put('/merchandising/new-arrivals', asyncHandler(productController.adminSaveNewArrivalIds))

admin.get('/settings', asyncHandler(settingsController.adminGetSettings))
admin.put('/settings', asyncHandler(settingsController.adminUpdateSettings))
admin.get('/settings/integrations', asyncHandler(settingsController.adminGetIntegrationsHealth))
admin.get('/shipping', asyncHandler(settingsController.adminGetShipping))
admin.put('/shipping', asyncHandler(settingsController.adminUpdateShipping))

admin.get('/analytics/sales', asyncHandler(analyticsController.adminSalesAnalytics))
admin.get('/analytics/products', asyncHandler(analyticsController.adminProductAnalytics))

admin.get('/orders/export', asyncHandler(userController.adminExportOrders))
admin.get('/orders/courier-status', asyncHandler(userController.adminGetCourierStatus))
admin.patch('/orders/bulk', asyncHandler(userController.adminBulkOrders))
admin.get('/orders', asyncHandler(userController.adminListOrders))
admin.get('/orders/:id/invoice', asyncHandler(userController.adminGetOrderInvoice))
admin.post('/orders/:id/confirm-cod', asyncHandler(userController.adminConfirmCod))
admin.post('/orders/:id/refund', asyncHandler(userController.adminProcessRefund))
admin.post('/orders/:id/rma', asyncHandler(userController.adminRmaAction))
admin.post('/orders/:id/courier/awb', asyncHandler(userController.adminGenerateCourierAwb))
admin.get('/orders/:id', asyncHandler(userController.adminGetOrder))
admin.patch('/orders/:id', asyncHandler(userController.adminPatchOrder))

admin.get('/users', asyncHandler(userController.adminListUsers))
admin.get('/users/:id', asyncHandler(userController.adminGetUser))
admin.patch('/users/:id', asyncHandler(userController.adminPatchUser))
admin.patch('/users/:id/disabled', asyncHandler(userController.adminPatchUserDisabled))

admin.get('/size-charts', asyncHandler(sizeChartController.adminListSizeCharts))
admin.post('/size-charts', asyncHandler(sizeChartController.adminCreateSizeChart))
admin.patch('/size-charts/:id', asyncHandler(sizeChartController.adminUpdateSizeChart))
admin.delete('/size-charts/:id', asyncHandler(sizeChartController.adminDeleteSizeChart))

admin.get('/coupons', asyncHandler(couponController.adminListCoupons))
admin.post('/coupons', asyncHandler(couponController.adminCreateCoupon))
admin.patch('/coupons/:id', asyncHandler(couponController.adminUpdateCoupon))
admin.delete('/coupons/:id', asyncHandler(couponController.adminDeleteCoupon))

admin.get('/reviews', asyncHandler(reviewController.adminListReviews))
admin.patch('/reviews/bulk', asyncHandler(reviewController.adminBulkReviews))
admin.patch('/reviews/:id', asyncHandler(reviewController.adminPatchReview))
admin.delete('/reviews/:id', asyncHandler(reviewController.adminDeleteReview))

router.use('/admin', admin)

router.use((err, _req, res, _next) => {
  console.error(err)
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message })
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id' })
  }
  res.status(500).json({ message: err.message || 'Server error' })
})

module.exports = router
