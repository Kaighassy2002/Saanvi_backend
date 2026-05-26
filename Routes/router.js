const express = require('express')
const { requireAdmin } = require('../middleware/authAdmin')
const { requireCustomer } = require('../middleware/authCustomer')
const { asyncHandler } = require('../Controller/helpers/asyncHandler')
const productController = require('../Controller/productController')
const userController = require('../Controller/userController')
const reviewController = require('../Controller/reviewController')
const uploadController = require('../Controller/uploadController')
const { optionalCustomer } = require('../middleware/optionalCustomer')

const router = express.Router()

router.get('/health', (_req, res) => {
  res.json({ ok: true })
})

router.get('/categories', asyncHandler(productController.listCategories))
router.get('/products', asyncHandler(productController.listPublishedProducts))
router.get('/products/reviews/summaries', asyncHandler(reviewController.reviewSummaries))
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
router.get('/merchandising/new-arrivals', asyncHandler(productController.listPublicNewArrivalIds))

router.post('/auth/register', asyncHandler(userController.customerRegister))
router.post('/auth/login', asyncHandler(userController.customerLogin))
router.post('/auth/forgot-password/request', asyncHandler(userController.customerForgotPasswordRequest))
router.post('/auth/forgot-password/verify', asyncHandler(userController.customerForgotPasswordVerifyOtp))
router.post('/auth/forgot-password/reset', asyncHandler(userController.customerForgotPasswordReset))
router.get('/auth/me', requireCustomer, asyncHandler(userController.customerGetMe))
router.patch('/auth/me', requireCustomer, asyncHandler(userController.customerUpdateMe))
router.get('/auth/orders', requireCustomer, asyncHandler(userController.customerListOrders))

router.post('/orders', requireCustomer, asyncHandler(userController.customerPlaceOrder))

router.post('/admin/auth/login', asyncHandler(userController.adminLogin))

const admin = express.Router()
admin.use(requireAdmin)

admin.get('/upload/cloudinary-signature', asyncHandler(uploadController.adminGetCloudinarySignature))

admin.get('/products', asyncHandler(productController.adminListProducts))
admin.post('/products', asyncHandler(productController.adminCreateProduct))
admin.patch('/products/:id', asyncHandler(productController.adminUpdateProduct))
admin.delete('/products/:id', asyncHandler(productController.adminDeleteProduct))

admin.get('/categories', asyncHandler(productController.adminListCategories))
admin.put('/categories', asyncHandler(productController.adminReplaceCategories))

admin.get('/merchandising/new-arrivals', asyncHandler(productController.adminListNewArrivalIds))
admin.put('/merchandising/new-arrivals', asyncHandler(productController.adminSaveNewArrivalIds))

admin.get('/orders', asyncHandler(userController.adminListOrders))
admin.get('/orders/:id', asyncHandler(userController.adminGetOrder))
admin.patch('/orders/:id', asyncHandler(userController.adminPatchOrder))

admin.get('/users', asyncHandler(userController.adminListUsers))
admin.patch('/users/:id', asyncHandler(userController.adminPatchUserDisabled))

admin.get('/reviews', asyncHandler(reviewController.adminListReviews))
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
