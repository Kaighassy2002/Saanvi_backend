const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { OAuth2Client } = require('google-auth-library')
const mongoose = require('mongoose')
const Admin = require('../Models/Admin')
const Customer = require('../Models/Customer')
const Order = require('../Models/Order')
const Product = require('../Models/Product')
const PasswordResetOtp = require('../Models/PasswordResetOtp')
const {
  sendPasswordResetOtpEmail,
  sendOrderConfirmationEmail,
  sendAdminNewOrderEmail,
  sendOrderStatusEmail,
  sendOrderRefundEmail,
  sendAdminReturnRequestEmail,
} = require('./helpers/otpEmail')
const { codPaymentBlockedMessage } = require('./helpers/checkoutPolicy')
const { logAudit } = require('./helpers/auditLog')
const { getEffectivePermissions, sanitizePermissions } = require('../middleware/adminPermissions')
const { isValidObjectId } = require('./helpers/mongoIds')
const { isProduction } = require('../config/isProduction')
const { getShippingSettings, computeShippingFee } = require('./helpers/siteSettings')
const {
  RAZORPAY_CURRENCY,
  isRazorpayConfigured,
  getPublicKeyId,
  razorpayClient,
  verifyPaymentSignature,
  assertRazorpayPaymentCaptured,
} = require('./helpers/razorpay')
const {
  resolveAndMaybeDecrementLine,
  restockOrderItems,
  commitOrderItems,
  undoInventoryLine,
} = require('./helpers/orderLineStock')
const { isCommitStatus, isPreCommitStatus } = require('./helpers/stockInventory')
const {
  createPaymentForOrder,
  listPaymentsForOrderPublicId,
  syncLatestPaymentStatus,
  findPaymentByRazorpayId,
} = require('./helpers/orderPayments')
const {
  getInitialOrderState,
  validateOrderTransition,
  validatePaymentTransition,
  appendHistoryEntry,
  canCustomerCancel,
  canCustomerReturn,
  shouldRestockOnStatus,
  normalizeLegacyOrderStatus,
  generateOrderPublicId,
  buildPlacementHistory,
  paymentStatusOnDelivered,
  canPackOrder,
  generateRmaId,
  isCodPayment,
} = require('./helpers/orderWorkflow')
const { getOrCreateSettings } = require('./helpers/siteSettings')
const { generateGstInvoicePdf } = require('./helpers/orderInvoicePdf')
const {
  processRazorpayRefund,
  resolveRefundPaymentStatus,
  applyRefundToPayment,
  round2,
} = require('./helpers/orderRefund')
const { escapeRegex } = require('./helpers/safeRegex')
const { quoteCheckout, incrementCouponUsage, rollbackCheckoutReservations } = require('./helpers/checkoutQuote')
const {
  normalizeOrderItems,
  orderSummaryFromLines,
  enrichItemsWithRefundDisplay,
} = require('./helpers/orderLineItems')
const {
  cancelOrderLine,
  requestReturnOrderLine,
  adminCompleteLineReturn,
} = require('./helpers/orderLineActions')
const {
  getCourierHealth,
} = require('./helpers/orderCourier')
const { deliveryService } = require('../delivery')

const MIN_PASSWORD_LEN = 8
const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5
const RESET_TOKEN_EXPIRY = '10m'

function customerPublicJson(doc, { hasPassword } = {}) {
  const o = doc.toJSON()
  const out = {
    id: o.id,
    email: o.email,
    name: o.name || '',
    firstName: o.firstName || '',
    lastName: o.lastName || '',
    phone: o.phone || '',
    addresses: Array.isArray(o.addresses) ? o.addresses : [],
  }
  if (hasPassword !== undefined) {
    out.hasPassword = hasPassword
  }
  return out
}

function signCustomerToken(customer, secret) {
  return jwt.sign(
    { role: 'customer', sub: String(customer._id), email: customer.email },
    secret,
    { expiresIn: '7d' }
  )
}

function normalizeEmail(v) {
  return String(v || '')
    .toLowerCase()
    .trim()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function createNumericOtp() {
  const min = 10 ** (OTP_LENGTH - 1)
  const max = 10 ** OTP_LENGTH
  return String(crypto.randomInt(min, max))
}

function sanitizeAddressEntry(row) {
  const item = row && typeof row === 'object' ? row : {}
  return {
    id: String(item.id || '').trim(),
    label: String(item.label || '').trim(),
    firstName: String(item.firstName || '').trim(),
    lastName: String(item.lastName || '').trim(),
    phone: String(item.phone || '').replace(/\D/g, '').slice(0, 10),
    address: String(item.address || '').trim(),
    city: String(item.city || '').trim(),
    state: String(item.state || '').trim(),
    pincode: String(item.pincode || '').trim(),
  }
}

function sanitizeAddresses(input) {
  if (!Array.isArray(input)) return []
  return input
    .map(sanitizeAddressEntry)
    .filter((a) => a.id && a.label && a.address && a.city && a.state && /^\d{6}$/.test(a.pincode))
}

function sanitizeSavedCart(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((row) => {
      const productId = String(row?.productId ?? '').trim()
      const variantKey = String(row?.variantKey || row?.variantName || '').trim()
      const lineKey = String(row?.lineKey || '').trim()
      return {
        lineKey,
        productId,
        variantName: variantKey,
        variantKey,
        variantLabel: String(row?.variantLabel || '').trim(),
        name: String(row?.name || '').trim(),
        image: String(row?.image || '').trim(),
        quantity: Math.max(1, Number(row?.quantity) || 1),
        price: Math.max(0, Number(row?.price) || 0),
        maxStock: Math.max(1, Number(row?.maxStock) || 9999),
      }
    })
    .filter((row) => row.productId)
}

function sanitizeSavedWishlist(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((row) => ({
      productId: String(row?.productId || '').trim(),
      name: String(row?.name || '').trim(),
      image: String(row?.image || '').trim(),
      price: Math.max(0, Number(row?.price) || 0),
      category: String(row?.category || '').trim(),
    }))
    .filter((row) => row.productId)
}

async function getShippingFee(subtotal) {
  const shipping = await getShippingSettings()
  return computeShippingFee(subtotal, shipping)
}

function verifyClientTotal(clientTotal, serverTotal) {
  const left = Math.round((Number(clientTotal) || 0) * 100)
  const right = Math.round((Number(serverTotal) || 0) * 100)
  return left === right
}

function storefrontCheckoutErrorMessage(err) {
  const msg = String(err?.message || '')
  if (/Cast to embedded/i.test(msg) && /variants/i.test(msg)) {
    return 'A product in your cart has invalid variant data. Remove it from your cart and try again, or contact support.'
  }
  return msg || 'Could not place order'
}

// --- storefront customer auth ---

async function customerRegister(req, res) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim()
  const password = String(req.body?.password || '')
  const firstName = String(req.body?.firstName || '').trim()
  const lastName = String(req.body?.lastName || '').trim()
  const phone = String(req.body?.phone || '').trim()
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' })
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Valid email required' })
  }
  if (!firstName) {
    return res.status(400).json({ message: 'First name required' })
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LEN} characters` })
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const name = Customer.buildDisplayName(firstName, lastName)
  const createdAt = new Date().toISOString().slice(0, 10)
  try {
    const customer = await Customer.create({
      email,
      passwordHash,
      firstName,
      lastName,
      name,
      phone,
      createdAt,
      disabled: false,
    })
    const token = signCustomerToken(customer, secret)
    res.status(201).json({ token, user: customerPublicJson(customer) })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' })
    }
    throw err
  }
}

async function customerLogin(req, res) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim()
  const password = String(req.body?.password || '')
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' })
  }
  const customer = await Customer.findOne({ email }).select('+passwordHash')
  if (!customer) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }
  if (customer.disabled) {
    return res.status(403).json({ message: 'Account is disabled' })
  }
  if (!customer.passwordHash) {
    return res.status(401).json({ message: 'No password set for this account' })
  }
  if (!(await bcrypt.compare(password, customer.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }
  const token = signCustomerToken(customer, secret)
  res.json({ token, user: customerPublicJson(customer) })
}

async function customerGoogleLogin(req, res) {
  const secret = process.env.JWT_SECRET
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  if (!googleClientId) {
    return res.status(503).json({ message: 'Google sign-in is not configured' })
  }
  const credential = String(req.body?.credential || '').trim()
  if (!credential) {
    return res.status(400).json({ message: 'Google credential required' })
  }

  let payload
  try {
    const client = new OAuth2Client(googleClientId)
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    })
    payload = ticket.getPayload()
  } catch {
    return res.status(401).json({ message: 'Invalid Google sign-in' })
  }

  if (!payload?.email_verified) {
    return res.status(401).json({ message: 'Google email not verified' })
  }

  const googleId = String(payload.sub || '').trim()
  const email = normalizeEmail(payload.email)
  if (!googleId || !email) {
    return res.status(400).json({ message: 'Google account email required' })
  }

  const intent = String(req.body?.intent || 'login').toLowerCase() === 'register' ? 'register' : 'login'
  const googleFirstName = String(payload.given_name || '').trim()
  const googleLastName = String(payload.family_name || '').trim()

  let customer = await Customer.findOne({ googleId })
  if (!customer) {
    customer = await Customer.findOne({ email })
    if (customer) {
      if (customer.disabled) {
        return res.status(403).json({ message: 'Account is disabled' })
      }
      if (customer.googleId && customer.googleId !== googleId) {
        return res.status(409).json({ message: 'This email is linked to another Google account' })
      }
      if (!customer.googleId) {
        customer.googleId = googleId
        if (!customer.firstName && googleFirstName) {
          customer.firstName = googleFirstName
        }
        if (!customer.lastName && googleLastName) {
          customer.lastName = googleLastName
        }
        if (!customer.name) {
          customer.name =
            Customer.buildDisplayName(customer.firstName, customer.lastName) ||
            String(payload.name || '').trim()
        }
        await customer.save()
      }
    } else if (intent === 'register') {
      const name =
        Customer.buildDisplayName(googleFirstName, googleLastName) || String(payload.name || '').trim()
      const createdAt = new Date().toISOString().slice(0, 10)
      try {
        customer = await Customer.create({
          email,
          googleId,
          firstName: googleFirstName,
          lastName: googleLastName,
          name,
          createdAt,
          disabled: false,
        })
      } catch (err) {
        if (err.code === 11000) {
          customer = await Customer.findOne({ email })
          if (!customer) throw err
        } else {
          throw err
        }
      }
    } else {
      return res.status(404).json({
        message: 'This Google account is not registered. Please complete registration to continue.',
        code: 'REGISTRATION_REQUIRED',
        email,
        firstName: googleFirstName,
        lastName: googleLastName,
      })
    }
  }

  if (customer.disabled) {
    return res.status(403).json({ message: 'Account is disabled' })
  }

  const token = signCustomerToken(customer, secret)
  res.json({ token, user: customerPublicJson(customer) })
}

async function customerForgotPasswordRequest(req, res) {
  const email = normalizeEmail(req.body?.email)
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Valid email required' })
  }

  const customer = await Customer.findOne({ email }).select('_id email disabled')
  if (!customer || customer.disabled) {
    return res.json({
      message: 'If an account exists for this email, an OTP has been sent.',
    })
  }

  const otp = createNumericOtp()
  const otpHash = await bcrypt.hash(otp, 10)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  await PasswordResetOtp.findOneAndUpdate(
    { email },
    { $set: { otpHash, expiresAt, attempts: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  await sendPasswordResetOtpEmail({
    to: email,
    otp,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  })

  res.json({
    message: 'If an account exists for this email, an OTP has been sent.',
  })
}

async function customerForgotPasswordVerifyOtp(req, res) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const email = normalizeEmail(req.body?.email)
  const otp = String(req.body?.otp || '').trim()
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Valid email required' })
  }
  if (!otp || otp.length !== OTP_LENGTH || !/^\d+$/.test(otp)) {
    return res.status(400).json({ message: `OTP must be ${OTP_LENGTH} digits` })
  }

  const customer = await Customer.findOne({ email }).select('_id email disabled')
  if (!customer || customer.disabled) {
    return res.status(400).json({ message: 'Invalid or expired OTP' })
  }

  const otpDoc = await PasswordResetOtp.findOne({ email }).select('+otpHash')
  if (!otpDoc || otpDoc.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Invalid or expired OTP' })
  }
  if (otpDoc.attempts >= OTP_MAX_ATTEMPTS) {
    await PasswordResetOtp.deleteOne({ _id: otpDoc._id })
    return res.status(429).json({ message: 'Too many invalid OTP attempts. Please request a new OTP.' })
  }

  const ok = await bcrypt.compare(otp, otpDoc.otpHash)
  if (!ok) {
    otpDoc.attempts += 1
    await otpDoc.save()
    return res.status(400).json({ message: 'Invalid or expired OTP' })
  }

  const resetToken = jwt.sign(
    {
      role: 'customer-password-reset',
      sub: String(customer._id),
      email,
      otpId: String(otpDoc._id),
    },
    secret,
    { expiresIn: RESET_TOKEN_EXPIRY }
  )

  res.json({ resetToken, expiresIn: RESET_TOKEN_EXPIRY })
}

async function customerForgotPasswordReset(req, res) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const resetToken = String(req.body?.resetToken || '')
  const newPassword = String(req.body?.newPassword || '')
  if (!resetToken) {
    return res.status(400).json({ message: 'resetToken required' })
  }
  if (newPassword.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LEN} characters` })
  }

  let payload
  try {
    payload = jwt.verify(resetToken, secret)
  } catch {
    return res.status(401).json({ message: 'Invalid or expired reset token' })
  }

  if (payload?.role !== 'customer-password-reset' || !payload?.sub || !payload?.email || !payload?.otpId) {
    return res.status(401).json({ message: 'Invalid reset token' })
  }

  const customer = await Customer.findById(payload.sub).select('+passwordHash')
  if (!customer || customer.disabled || normalizeEmail(customer.email) !== normalizeEmail(payload.email)) {
    return res.status(404).json({ message: 'User not found' })
  }

  const otpDoc = await PasswordResetOtp.findOne({ _id: payload.otpId, email: normalizeEmail(payload.email) })
  if (!otpDoc || otpDoc.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Reset session expired. Please request a new OTP.' })
  }

  customer.passwordHash = await bcrypt.hash(newPassword, 10)
  await customer.save()
  await PasswordResetOtp.deleteMany({ email: normalizeEmail(payload.email) })

  res.json({ message: 'Password reset successful. Please log in with your new password.' })
}

async function customerGetMe(req, res) {
  const customer = await Customer.findById(req.customer.sub).select('+passwordHash')
  if (!customer || customer.disabled) {
    return res.status(404).json({ message: 'User not found' })
  }
  res.json(customerPublicJson(customer, { hasPassword: Boolean(customer.passwordHash) }))
}

async function customerUpdateMe(req, res) {
  const body = req.body || {}
  const customer = await Customer.findById(req.customer.sub).select('+passwordHash')
  if (!customer || customer.disabled) {
    return res.status(404).json({ message: 'User not found' })
  }
  const updates = {}
  if (body.firstName !== undefined) updates.firstName = String(body.firstName).trim()
  if (body.lastName !== undefined) updates.lastName = String(body.lastName).trim()
  if (body.phone !== undefined) updates.phone = String(body.phone).trim()
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.addresses !== undefined) updates.addresses = sanitizeAddresses(body.addresses)

  const newPassword = body.newPassword != null ? String(body.newPassword) : ''
  const currentPassword = body.currentPassword != null ? String(body.currentPassword) : ''
  if (newPassword) {
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LEN} characters` })
    }
    if (!currentPassword) {
      return res.status(400).json({ message: 'currentPassword required to change password' })
    }
    if (!customer.passwordHash || !(await bcrypt.compare(currentPassword, customer.passwordHash))) {
      return res.status(401).json({ message: 'Current password is incorrect' })
    }
    updates.passwordHash = await bcrypt.hash(newPassword, 10)
  }

  const nextFirst = updates.firstName !== undefined ? updates.firstName : customer.firstName
  const nextLast = updates.lastName !== undefined ? updates.lastName : customer.lastName
  if (body.name === undefined && (updates.firstName !== undefined || updates.lastName !== undefined)) {
    updates.name = Customer.buildDisplayName(nextFirst, nextLast)
  }

  Object.assign(customer, updates)
  await customer.save()
  const fresh = await Customer.findById(customer._id).select('+passwordHash')
  res.json(customerPublicJson(fresh, { hasPassword: Boolean(fresh?.passwordHash) }))
}

async function customerGetCart(req, res) {
  const customer = await Customer.findById(req.customer.sub).select('savedCart disabled')
  if (!customer || customer.disabled) {
    return res.status(404).json({ message: 'User not found' })
  }
  res.json({ items: Array.isArray(customer.savedCart) ? customer.savedCart : [] })
}

async function customerPutCart(req, res) {
  const customer = await Customer.findById(req.customer.sub).select('savedCart disabled')
  if (!customer || customer.disabled) {
    return res.status(404).json({ message: 'User not found' })
  }
  customer.savedCart = sanitizeSavedCart(req.body?.items)
  await customer.save()
  res.json({ items: customer.savedCart })
}

async function customerGetWishlist(req, res) {
  const customer = await Customer.findById(req.customer.sub).select('savedWishlist disabled')
  if (!customer || customer.disabled) {
    return res.status(404).json({ message: 'User not found' })
  }
  res.json({ items: Array.isArray(customer.savedWishlist) ? customer.savedWishlist : [] })
}

async function customerPutWishlist(req, res) {
  const customer = await Customer.findById(req.customer.sub).select('savedWishlist disabled')
  if (!customer || customer.disabled) {
    return res.status(404).json({ message: 'User not found' })
  }
  customer.savedWishlist = sanitizeSavedWishlist(req.body?.items)
  await customer.save()
  res.json({ items: customer.savedWishlist })
}

// --- admin auth ---

async function adminLogin(req, res) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ message: 'Server missing JWT_SECRET' })
  }
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim()
  const password = String(req.body?.password || '')
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' })
  }
  const admin = await Admin.findOne({ email })
  if (!admin || admin.disabled || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }
  const role = admin.role || 'owner'
  const effectivePermissions = [...getEffectivePermissions(admin)]
  const token = jwt.sign({ role, email: admin.email }, secret, { expiresIn: '7d' })
  res.json({
    token,
    user: {
      email: admin.email,
      role,
      name: admin.name || '',
      permissions: sanitizePermissions(admin.permissions),
      effectivePermissions,
    },
  })
}

async function adminGetMe(req, res) {
  const email = String(req.admin?.email || '')
    .toLowerCase()
    .trim()
  const admin = await Admin.findOne({ email }).select('email role name permissions disabled').lean()
  if (!admin || admin.disabled) {
    return res.status(401).json({ message: 'Account not found' })
  }
  res.json({
    email: admin.email,
    role: admin.role || 'owner',
    name: admin.name || '',
    permissions: sanitizePermissions(admin.permissions),
    effectivePermissions: [...getEffectivePermissions(admin)],
  })
}

async function adminChangePassword(req, res) {
  const body = req.body || {}
  const currentPassword = body.currentPassword != null ? String(body.currentPassword) : ''
  const newPassword = body.newPassword != null ? String(body.newPassword) : ''

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'currentPassword and newPassword are required' })
  }
  if (newPassword.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LEN} characters` })
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'New password must be different from current password' })
  }

  const email = String(req.admin?.email || '')
    .toLowerCase()
    .trim()
  if (!email) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const admin = await Admin.findOne({ email })
  if (!admin) {
    return res.status(404).json({ message: 'Admin account not found' })
  }
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
    return res.status(400).json({ message: 'Current password is incorrect' })
  }

  admin.passwordHash = await bcrypt.hash(newPassword, 10)
  await admin.save()

  await logAudit({
    adminEmail: admin.email,
    action: 'admin.password_change',
    entityType: 'admin',
    entityId: admin.email,
  })

  res.json({ message: 'Password updated successfully' })
}

// --- admin customers ---

const { parsePagination, paginatedResponse } = require('./helpers/pagination')

async function adminListUsers(req, res) {
  const { page, limit, skip, q } = parsePagination(req.query)
  const filter = {}
  const status = String(req.query.status || '').toLowerCase()
  if (status === 'active') filter.disabled = { $ne: true }
  else if (status === 'disabled') filter.disabled = true
  if (q) {
    const safeQ = escapeRegex(q)
    filter.$or = [
      { email: { $regex: safeQ, $options: 'i' } },
      { name: { $regex: safeQ, $options: 'i' } },
      { firstName: { $regex: safeQ, $options: 'i' } },
      { lastName: { $regex: safeQ, $options: 'i' } },
      { phone: { $regex: safeQ, $options: 'i' } },
    ]
  }
  const [docs, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ])
  const items = docs.map((d) => d.toJSON())
  res.json(paginatedResponse(items, total, page, limit))
}

async function adminGetUser(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'User not found' })
  }
  const doc = await Customer.findById(id)
  if (!doc) {
    return res.status(404).json({ message: 'User not found' })
  }
  const email = (doc.email || '').toLowerCase().trim()
  const orders = await Order.find({
    $or: [{ customerUserId: String(id) }, { customerEmail: email }],
  })
    .sort({ date: -1 })
    .limit(50)
  res.json({
    user: doc.toJSON(),
    orders: orders.map((o) => o.toJSON()),
  })
}

async function adminPatchUser(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'User not found' })
  }
  const body = req.body || {}
  const updates = {}
  if (typeof body.disabled === 'boolean') updates.disabled = body.disabled
  if (body.adminNotes !== undefined) updates.adminNotes = String(body.adminNotes)
  if (body.tags !== undefined) {
    updates.tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(body.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
  }
  const doc = await Customer.findByIdAndUpdate(id, { $set: updates }, { new: true })
  if (!doc) {
    return res.status(404).json({ message: 'User not found' })
  }
  res.json(doc.toJSON())
}

async function adminPatchUserDisabled(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: 'User not found' })
  }
  const disabled = req.body?.disabled
  if (typeof disabled !== 'boolean') {
    return res.status(400).json({ message: 'disabled boolean required' })
  }
  const doc = await Customer.findByIdAndUpdate(id, { $set: { disabled } }, { new: true })
  if (!doc) {
    return res.status(404).json({ message: 'User not found' })
  }
  res.json(doc.toJSON())
}

function validateCheckoutPayload(body) {
  const shipping = body.shipping || {}
  const firstName = String(shipping.firstName || '').trim()
  const lastName = String(shipping.lastName || '').trim()
  const email = String(shipping.email || '')
    .trim()
    .toLowerCase()
  const phoneDigits = String(shipping.phone || '').replace(/\D/g, '')
  const address = String(shipping.address || '').trim()
  const city = String(shipping.city || '').trim()
  const state = String(shipping.state || '').trim()
  const pincode = String(shipping.pincode || '').trim()
  if (!firstName) return 'First name required'
  if (!lastName) return 'Last name required'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Valid email required'
  if (!phoneDigits || !/^[6-9]\d{9}$/.test(phoneDigits)) return 'Valid 10-digit Indian mobile required'
  if (!address) return 'Address required'
  if (!city) return 'City required'
  if (!state) return 'State required'
  if (!/^\d{6}$/.test(pincode)) return '6-digit pincode required'
  const items = body.items
  if (!Array.isArray(items) || items.length === 0) return 'Cart items required'
  for (const line of items) {
    if (line == null || line.quantity == null || Number(line.quantity) < 1) return 'Invalid line item quantity'
    if (!isValidObjectId(line.productId)) return 'Invalid product in cart'
  }
  return null
}

// --- storefront orders (persisted in MongoDB) ---

function normalizePaymentMethod(method) {
  const key = String(method || '')
    .trim()
    .toLowerCase()
  if (key === 'razorpay' || key === 'online' || key === 'upi' || key === 'card') return 'razorpay'
  return 'cod'
}

async function buildVerifiedOrderItems(rawItems, session, couponCode = '') {
  const quote = await quoteCheckout(rawItems, { session, decrement: true, couponCode })
  return quote
}

async function placeOrderWithoutTransaction({
  body,
  shipping,
  customerName,
  publicId,
  date,
  customerUserId,
  paymentStatus,
  razorpayOrderId = '',
  razorpayPaymentId = '',
  instrument = '',
}) {
  const couponCode = String(body.couponCode || '').trim()
  let reservations = []
  try {
    const {
      verifiedItems,
      subtotal,
      shippingFee,
      total,
      couponDiscount,
      couponId,
      couponCode: appliedCouponCode,
      reservations: reserved,
    } = await quoteCheckout(body.items, { decrement: true, couponCode })
    reservations = reserved || []
    if (!verifyClientTotal(body.total, total)) {
      throw new Error('Order total mismatch. Please refresh cart and try again.')
    }
    const paymentMethod = normalizePaymentMethod(body.paymentMethod)
    const placedAt = new Date()
    const { status, paymentStatus: orderPaymentStatus } = getInitialOrderState(
      paymentMethod,
      paymentStatus
    )
    const doc = await Order.create({
      publicId,
      date,
      placedAt,
      status,
      subtotal,
      shippingFee,
      couponCode: appliedCouponCode || '',
      couponDiscount,
      total,
      customerEmail: shipping.email,
      customerName,
      shipping,
      paymentMethod,
      trackingNumber: '',
      internalNotes: '',
      placedVia: 'storefront',
      paymentStatus: orderPaymentStatus,
      customerUserId,
      items: verifiedItems,
      statusHistory: buildPlacementHistory({
        paymentStatus: orderPaymentStatus,
        paymentMethod,
        by: 'system',
      }),
    })
    if (couponId) {
      await incrementCouponUsage(couponId)
    }
    await createPaymentForOrder({
      orderDoc: doc,
      paymentMethod,
      paymentStatus: orderPaymentStatus,
      razorpayOrderId,
      razorpayPaymentId,
      instrument,
    })
    return doc
  } catch (err) {
    if (reservations.length) {
      await rollbackCheckoutReservations(reservations)
    }
    throw err
  }
}

async function quoteVerifiedItems(rawItems, couponCode = '') {
  return quoteCheckout(rawItems, { decrement: false, couponCode })
}

async function createPaidStorefrontOrder({
  body,
  shipping,
  customerUserId,
  paymentStatus,
  razorpayOrderId = '',
  razorpayPaymentId = '',
  instrument = '',
}) {
  const customerName = `${shipping.firstName} ${shipping.lastName}`.trim()
  const publicId = await generateOrderPublicId(Order)
  const placedAt = new Date()
  const date = placedAt.toISOString().slice(0, 10)
  const paymentMethod = normalizePaymentMethod(body.paymentMethod)
  const { status: initialStatus, paymentStatus: orderPaymentStatus } = getInitialOrderState(
    paymentMethod,
    paymentStatus
  )
  const session = await mongoose.startSession()
  let doc
  const couponCode = String(body.couponCode || '').trim()
  try {
    session.startTransaction()
    const {
      verifiedItems,
      subtotal,
      shippingFee,
      total,
      couponDiscount,
      couponId,
      couponCode: appliedCouponCode,
    } = await quoteCheckout(body.items, { session, decrement: true, couponCode })
    if (!verifyClientTotal(body.total, total)) {
      throw new Error('Order total mismatch. Please refresh cart and try again.')
    }
    ;[doc] = await Order.create(
      [
        {
          publicId,
          date,
          placedAt,
          status: initialStatus,
          subtotal,
          shippingFee,
          couponCode: appliedCouponCode || '',
          couponDiscount,
          total,
          customerEmail: shipping.email,
          customerName,
          shipping,
          paymentMethod,
          paymentStatus: orderPaymentStatus,
          trackingNumber: '',
          internalNotes: '',
          placedVia: 'storefront',
          customerUserId,
          items: verifiedItems,
          statusHistory: buildPlacementHistory({
            paymentStatus: orderPaymentStatus,
            paymentMethod,
            by: 'system',
          }),
        },
      ],
      { session }
    )
    if (couponId) {
      await incrementCouponUsage(couponId, session)
    }
    await createPaymentForOrder({
      orderDoc: doc,
      paymentMethod,
      paymentStatus: orderPaymentStatus,
      razorpayOrderId,
      razorpayPaymentId,
      instrument,
      session,
    })
    await session.commitTransaction()
  } catch (err) {
    await session.abortTransaction()
    const msg = String(err?.message || '')
    const transactionUnavailable =
      msg.includes('Transaction numbers are only allowed on a replica set member') ||
      msg.includes('Transaction support is disabled')
    if (transactionUnavailable) {
      if (isProduction()) {
        throw new Error(
          'Order placement is temporarily unavailable. Database must support transactions in production.'
        )
      }
      doc = await placeOrderWithoutTransaction({
        body,
        shipping,
        customerName,
        publicId,
        date,
        customerUserId,
        paymentStatus,
        razorpayOrderId,
        razorpayPaymentId,
        instrument,
      })
    } else {
      throw err
    }
  } finally {
    await session.endSession()
  }
  return doc
}

async function customerQuoteCheckout(req, res) {
  const body = req.body || {}
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return res.status(400).json({ message: 'Cart items required' })
  }
  for (const line of items) {
    if (line == null || line.quantity == null || Number(line.quantity) < 1) {
      return res.status(400).json({ message: 'Invalid line item quantity' })
    }
    if (!isValidObjectId(line.productId)) {
      return res.status(400).json({ message: 'Invalid product in cart' })
    }
  }
  const couponCode = String(body.couponCode || '').trim()
  try {
    const quote = await quoteVerifiedItems(items, couponCode)
    res.json({
      subtotal: quote.subtotal,
      shippingFee: quote.shippingFee,
      couponDiscount: quote.couponDiscount,
      couponCode: quote.couponCode,
      total: quote.total,
    })
  } catch (err) {
    res.status(400).json({ message: storefrontCheckoutErrorMessage(err) })
  }
}

async function customerPlaceOrder(req, res) {
  const errMsg = validateCheckoutPayload(req.body || {})
  if (errMsg) {
    return res.status(400).json({ message: errMsg })
  }
  const body = req.body || {}
  const shipping = {
    firstName: String(body.shipping.firstName).trim(),
    lastName: String(body.shipping.lastName).trim(),
    email: String(body.shipping.email).trim().toLowerCase(),
    phone: String(body.shipping.phone).replace(/\D/g, ''),
    address: String(body.shipping.address).trim(),
    city: String(body.shipping.city).trim(),
    state: String(body.shipping.state).trim(),
    pincode: String(body.shipping.pincode).trim(),
  }
  const customerUserId = String(req.customer.sub)
  const settings = await getOrCreateSettings()
  const codBlocked = codPaymentBlockedMessage(settings, body.paymentMethod)
  if (codBlocked) {
    return res.status(400).json({ message: codBlocked })
  }
  let doc
  try {
    doc = await createPaidStorefrontOrder({
      body,
      shipping,
      customerUserId,
      paymentStatus: normalizePaymentMethod(body.paymentMethod) === 'cod' ? 'pending' : 'paid',
    })
  } catch (err) {
    return res.status(400).json({ message: storefrontCheckoutErrorMessage(err) })
  }

  sendOrderConfirmationEmail({
    to: shipping.email,
    orderId: doc.publicId,
    customerName: doc.customerName,
    total: doc.total,
    itemCount: doc.items.length,
  }).catch((err) => {
    console.error('Order confirmation email failed:', err.message)
  })

  sendAdminNewOrderEmail({
    orderId: doc.publicId,
    customerName: doc.customerName,
    customerPhone: shipping.phone,
    customerEmail: shipping.email,
    total: doc.total,
    itemCount: doc.items.length,
    paymentMethod: doc.paymentMethod,
  }).catch((err) => {
    console.error('Admin new-order email failed:', err.message)
  })

  res.status(201).json(doc.toJSON())
}

async function createRazorpayOrder(req, res) {
  const body = req.body || {}
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return res.status(400).json({ message: 'Cart items required' })
  }
  if (!isRazorpayConfigured()) {
    return res.status(503).json({ message: 'Online payment is not configured. Use Cash on Delivery or contact support.' })
  }
  const rp = razorpayClient()
  const couponCode = String(body.couponCode || '').trim()
  const { subtotal, shippingFee, total } = await quoteVerifiedItems(items, couponCode)
  if (!verifyClientTotal(body.total, total)) {
    return res.status(400).json({ message: 'Order total mismatch. Please refresh cart and try again.' })
  }
  if (total < 1) {
    return res.status(400).json({ message: 'Order total must be at least ₹1 for online payment.' })
  }
  const amountPaise = Math.round(total * 100)
  try {
    const created = await rp.orders.create({
      amount: amountPaise,
      currency: RAZORPAY_CURRENCY,
      receipt: `rcpt_${Date.now()}`,
      notes: {
        customerUserId: String(req.customer.sub),
        subtotal: String(subtotal),
        shippingFee: String(shippingFee),
      },
    })
    res.json({
      razorpayOrderId: created.id,
      amount: created.amount,
      currency: created.currency,
      keyId: getPublicKeyId(),
      subtotal,
      shippingFee,
      total,
    })
  } catch (err) {
    console.error('Razorpay order create failed:', err?.message || err)
    res.status(502).json({
      message: err?.error?.description || err?.message || 'Could not start payment. Check Razorpay keys.',
    })
  }
}

async function verifyRazorpayPayment(req, res) {
  const body = req.body || {}
  const shipping = body.shipping || {}
  const firstName = String(shipping.firstName || '').trim()
  const lastName = String(shipping.lastName || '').trim()
  const email = String(shipping.email || '').trim().toLowerCase()
  const phone = String(shipping.phone || '').replace(/\D/g, '')
  const address = String(shipping.address || '').trim()
  const city = String(shipping.city || '').trim()
  const state = String(shipping.state || '').trim()
  const pincode = String(shipping.pincode || '').trim()
  if (!firstName || !lastName || !email || !phone || !address || !city || !state || !/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ message: 'Valid shipping details required' })
  }
  const razorpayOrderId = String(body.razorpayOrderId || '').trim()
  const razorpayPaymentId = String(body.razorpayPaymentId || '').trim()
  const razorpaySignature = String(body.razorpaySignature || '').trim()
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ message: 'Razorpay verification fields are required' })
  }
  if (!isRazorpayConfigured()) {
    return res.status(503).json({ message: 'Online payment is not configured on server' })
  }
  if (
    !verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    })
  ) {
    return res.status(400).json({ message: 'Payment verification failed' })
  }

  const customerUserId = String(req.customer.sub)
  const existingPayment = await findPaymentByRazorpayId(razorpayPaymentId)
  if (existingPayment) {
    const existingOrder = await Order.findOne({ publicId: existingPayment.orderPublicId })
    if (existingOrder) {
      if (String(existingOrder.customerUserId) !== customerUserId) {
        return res.status(409).json({ message: 'This payment has already been processed' })
      }
      return res.status(200).json(existingOrder.toJSON())
    }
  }

  const rp = razorpayClient()
  try {
    const couponCode = String(body.couponCode || '').trim()
    const { total } = await quoteVerifiedItems(body.items || [], couponCode)
    if (!verifyClientTotal(body.total, total)) {
      return res.status(400).json({ message: 'Order total mismatch. Please refresh cart and try again.' })
    }
    const rpPayment = await assertRazorpayPaymentCaptured(rp, {
      razorpayOrderId,
      razorpayPaymentId,
      expectedTotalInr: total,
    })
    const doc = await createPaidStorefrontOrder({
      body: {
        items: body.items,
        total: body.total,
        paymentMethod: body.paymentMethod || 'razorpay',
        couponCode,
      },
      shipping: { firstName, lastName, email, phone, address, city, state, pincode },
      customerUserId,
      paymentStatus: 'paid',
      razorpayOrderId,
      razorpayPaymentId,
      instrument: String(rpPayment?.method || ''),
    })
    sendOrderConfirmationEmail({
      to: email,
      orderId: doc.publicId,
      customerName: doc.customerName,
      total: doc.total,
      itemCount: doc.items.length,
    }).catch((err) => {
      console.error('Order confirmation email failed:', err.message)
    })
    sendAdminNewOrderEmail({
      orderId: doc.publicId,
      customerName: doc.customerName,
      customerPhone: phone,
      customerEmail: email,
      total: doc.total,
      itemCount: doc.items.length,
      paymentMethod: doc.paymentMethod,
    }).catch((err) => {
      console.error('Admin new-order email failed:', err.message)
    })
    res.status(201).json(doc.toJSON())
  } catch (err) {
    if (err?.code === 11000 && String(err?.message || '').includes('razorpayPaymentId')) {
      const replayPayment = await findPaymentByRazorpayId(razorpayPaymentId)
      const replayOrder = replayPayment
        ? await Order.findOne({ publicId: replayPayment.orderPublicId })
        : null
      if (replayOrder && String(replayOrder.customerUserId) === customerUserId) {
        return res.status(200).json(replayOrder.toJSON())
      }
      return res.status(409).json({ message: 'This payment has already been processed' })
    }
    const msg = err?.message || 'Could not finalize payment order'
    const status = msg.includes('verification') || msg.includes('mismatch') ? 400 : 502
    res.status(status).json({ message: msg })
  }
}

async function findCustomerOrderForRequest(req, orderId) {
  const sub = String(req.customer.sub)
  const customer = await Customer.findById(sub).select('email')
  const email = (customer?.email || req.customer.email || '').toLowerCase().trim()
  const ownerFilter = { $or: [{ customerUserId: sub }, { customerEmail: email }] }
  const key = String(orderId || '').trim()
  if (!key) return null

  let doc = await Order.findOne({ publicId: key, ...ownerFilter })
  if (!doc && isValidObjectId(key)) {
    doc = await Order.findOne({ _id: key, ...ownerFilter })
  }
  return doc
}

function orderToClientJson(doc, extra = {}) {
  const json = doc.toJSON ? doc.toJSON() : { ...doc }
  const normalized = normalizeOrderItems(json.items, json)
  const items = enrichItemsWithRefundDisplay(normalized, json)
  const lineSummary = orderSummaryFromLines(items, json.total, json.refunds)
  return { ...json, items, lineSummary, ...extra }
}

async function customerListOrders(req, res) {
  const sub = String(req.customer.sub)
  const customer = await Customer.findById(sub).select('email')
  const email = (customer?.email || req.customer.email || '').toLowerCase().trim()
  const docs = await Order.find({
    $or: [{ customerUserId: sub }, { customerEmail: email }],
  }).sort({ placedAt: -1, date: -1 })
  res.json({ orders: docs.map((d) => orderToClientJson(d)) })
}

async function customerGetOrder(req, res) {
  const doc = await findCustomerOrderForRequest(req, req.params.id)
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  const payments = await listPaymentsForOrderPublicId(doc.publicId)
  res.json(
    orderToClientJson(doc, {
      payments: payments.map((p) => p.toJSON()),
    })
  )
}

async function customerRequestCancel(req, res) {
  const doc = await findCustomerOrderForRequest(req, req.params.id)
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  if (!canCustomerCancel(doc.status)) {
    return res.status(400).json({
      message: 'Cancellation is only available before your order is shipped',
    })
  }
  const note = String(req.body?.note || 'Customer requested cancellation').trim()
  const by = doc.customerEmail || 'customer'
  const status = normalizeLegacyOrderStatus(doc.status)

  if (status === 'Placed') {
    const history = appendHistoryEntry(doc.statusHistory, {
      status: 'Cancelled',
      paymentStatus: doc.paymentStatus,
      note: note || 'Order cancelled by customer',
      by,
    })
    doc.status = 'Cancelled'
    doc.cancelReason = note
    doc.statusHistory = history
    await doc.save()
    await restockOrderItems(Product, doc.items, null, doc.publicId, doc.stockCommitted)
    return res.json(doc.toJSON())
  }

  const history = appendHistoryEntry(doc.statusHistory, {
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    note: note || 'Cancellation requested — awaiting store approval',
    by,
  })
  doc.cancellationRequestedAt = new Date()
  doc.cancelReason = note
  doc.statusHistory = history
  await doc.save()
  res.json(doc.toJSON())
}

async function customerCancelLineItem(req, res) {
  const doc = await findCustomerOrderForRequest(req, req.params.id)
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  const lineId = String(req.params.lineId || '').trim()
  const note = String(req.body?.note || 'Customer cancelled item').trim()
  const by = doc.customerEmail || 'customer'
  try {
    const result = await cancelOrderLine(doc, lineId, { note, by })
    if (result.refundAmount > 0) {
      await sendOrderRefundEmail({
        to: doc.customerEmail,
        orderId: doc.publicId,
        customerName: doc.customerName,
        amount: result.refundAmount,
        note: `Cancelled: ${result.lineName}`,
      }).catch(() => {})
    }
    const payments = await listPaymentsForOrderPublicId(doc.publicId)
    res.json(
      orderToClientJson(result.order, {
        payments: payments.map((p) => p.toJSON()),
      })
    )
  } catch (err) {
    res.status(400).json({ message: err.message || 'Could not cancel item' })
  }
}

async function customerReturnLineItem(req, res) {
  const doc = await findCustomerOrderForRequest(req, req.params.id)
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  const lineId = String(req.params.lineId || '').trim()
  const note = String(req.body?.note || 'Customer requested return').trim()
  const by = doc.customerEmail || 'customer'
  try {
    const result = await requestReturnOrderLine(doc, lineId, { note, by })
    await sendOrderStatusEmail({
      to: doc.customerEmail,
      orderId: doc.publicId,
      customerName: doc.customerName,
      status: 'Return Requested',
    }).catch(() => {})
    await sendAdminReturnRequestEmail({
      orderId: doc.publicId,
      customerName: doc.customerName,
      returnReason: `${result.lineName}: ${note}`,
      rmaId: result.rmaId,
    }).catch(() => {})
    const payments = await listPaymentsForOrderPublicId(doc.publicId)
    res.json(
      orderToClientJson(result.order, {
        payments: payments.map((p) => p.toJSON()),
      })
    )
  } catch (err) {
    res.status(400).json({ message: err.message || 'Could not request return' })
  }
}

async function customerRequestReturn(req, res) {
  const doc = await findCustomerOrderForRequest(req, req.params.id)
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  if (!canCustomerReturn(doc.status)) {
    return res.status(400).json({ message: 'Returns are only available for delivered orders' })
  }
  const note = String(req.body?.note || 'Customer requested return').trim()
  const err = validateOrderTransition(doc.status, 'Return Requested')
  if (err) return res.status(400).json({ message: err })

  const history = appendHistoryEntry(doc.statusHistory, {
    status: 'Return Requested',
    paymentStatus: doc.paymentStatus,
    note: note || 'Return requested by customer',
    by: doc.customerEmail || 'customer',
  })
  doc.status = 'Return Requested'
  doc.returnRequestedAt = new Date()
  doc.returnReason = note
  doc.rmaId = doc.rmaId || generateRmaId(doc.publicId)
  doc.rmaStatus = 'requested'
  doc.statusHistory = history
  await doc.save()

  sendOrderStatusEmail({
    to: doc.customerEmail,
    orderId: doc.publicId,
    customerName: doc.customerName,
    status: 'Return Requested',
  }).catch(() => {})

  sendAdminReturnRequestEmail({
    orderId: doc.publicId,
    customerName: doc.customerName,
    returnReason: note,
    rmaId: doc.rmaId,
  }).catch(() => {})

  res.json(doc.toJSON())
}

// --- admin orders ---

function buildOrderListFilter(query) {
  const filter = {}
  if (query.status && query.status !== 'All') {
    filter.status = String(query.status)
  }
  if (query.paymentStatus && query.paymentStatus !== 'All') {
    filter.paymentStatus = String(query.paymentStatus).toLowerCase()
  }
  if (query.paymentMethod && query.paymentMethod !== 'All') {
    const key = String(query.paymentMethod).toLowerCase()
    if (key === 'cod') filter.paymentMethod = { $in: ['cod', 'COD', 'Cash on Delivery'] }
    else filter.paymentMethod = { $in: ['razorpay', 'online', 'upi', 'card', 'Razorpay'] }
  }
  if (query.codPending === '1' || query.codPending === 'true') {
    filter.paymentMethod = { $in: ['cod', 'COD', 'Cash on Delivery'] }
    filter.status = { $in: ['Placed', 'Confirmed'] }
    filter.codConfirmedAt = null
  }
  const q = String(query.q || '').trim()
  if (q) {
    const safeQ = escapeRegex(q)
    filter.$or = [
      { publicId: { $regex: safeQ, $options: 'i' } },
      { customerEmail: { $regex: safeQ, $options: 'i' } },
      { customerName: { $regex: safeQ, $options: 'i' } },
      { 'shipping.phone': { $regex: safeQ, $options: 'i' } },
      { rmaId: { $regex: safeQ, $options: 'i' } },
    ]
  }
  if (query.from || query.to) {
    filter.date = {}
    if (query.from) filter.date.$gte = String(query.from)
    if (query.to) filter.date.$lte = String(query.to)
  }
  return filter
}

async function notifyOrderStatusChange(doc, prevStatus) {
  const status = normalizeLegacyOrderStatus(doc.status)
  const prev = normalizeLegacyOrderStatus(prevStatus)
  if (status === prev) return
  const notifyStatuses = new Set([
    'Confirmed',
    'Shipped',
    'Out For Delivery',
    'Delivered',
    'Cancelled',
    'Return Requested',
    'Returned',
  ])
  if (!notifyStatuses.has(status)) return
  await sendOrderStatusEmail({
    to: doc.customerEmail,
    orderId: doc.publicId,
    customerName: doc.customerName,
    status,
    trackingNumber: doc.trackingNumber || doc.courierAwb,
    courierPartner: doc.courierPartner,
    trackingUrl: doc.trackingUrl,
  }).catch(() => {})
}

async function adminListOrders(req, res) {
  const { page, limit, skip } = parsePagination(req.query)
  const filter = buildOrderListFilter(req.query)
  const [docs, total] = await Promise.all([
    Order.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ])
  const items = docs.map((d) => d.toJSON())
  res.json(paginatedResponse(items, total, page, limit))
}

async function adminExportOrders(req, res) {
  const filter = buildOrderListFilter(req.query || {})
  const docs = await Order.find(filter).sort({ date: -1 }).lean()
  const header = [
    'id',
    'date',
    'status',
    'paymentStatus',
    'paymentMethod',
    'customerName',
    'customerEmail',
    'phone',
    'total',
    'courierPartner',
    'trackingNumber',
    'rmaId',
    'rmaStatus',
  ]
  const rows = docs.map((o) =>
    [
      o.publicId,
      o.date,
      o.status,
      o.paymentStatus,
      o.paymentMethod,
      o.customerName,
      o.customerEmail,
      o.shipping?.phone || '',
      o.total,
      o.courierPartner,
      o.trackingNumber || o.courierAwb,
      o.rmaId,
      o.rmaStatus,
    ]
      .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
      .join(',')
  )
  const csv = [header.join(','), ...rows].join('\n')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"')
  res.send(csv)
}

async function adminGetOrder(req, res) {
  const id = String(req.params.id || '').trim()
  let doc = await Order.findOne({ publicId: id })
  if (!doc && isValidObjectId(id)) {
    doc = await Order.findById(id)
  }
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  const payments = await listPaymentsForOrderPublicId(doc.publicId)
  res.json(
    orderToClientJson(doc, {
      payments: payments.map((p) => p.toJSON()),
    })
  )
}

async function adminCancelLineItem(req, res) {
  const id = String(req.params.id || '').trim()
  const lineId = String(req.params.lineId || '').trim()
  const body = req.body || {}
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  const note = String(req.body?.note || 'Cancelled by admin').trim()
  const by = String(req.admin?.email || 'admin')
  try {
    const result = await cancelOrderLine(doc, lineId, {
      note,
      by,
      skipGateway: body.skipGateway === true,
    })
    if (result.refundAmount > 0) {
      await sendOrderRefundEmail({
        to: doc.customerEmail,
        orderId: doc.publicId,
        customerName: doc.customerName,
        amount: result.refundAmount,
        note: `Cancelled: ${result.lineName}`,
      }).catch(() => {})
    }
    await logAudit({
      adminEmail: req.admin?.email,
      action: 'order.line.cancel',
      entityType: 'order',
      entityId: id,
      details: { lineId, refundAmount: result.refundAmount, lineName: result.lineName },
    })
    const payments = await listPaymentsForOrderPublicId(id)
    res.json(
      orderToClientJson(result.order, {
        payments: payments.map((p) => p.toJSON()),
      })
    )
  } catch (err) {
    res.status(400).json({ message: err.message || 'Could not cancel line item' })
  }
}

async function adminLineRmaAction(req, res) {
  const id = String(req.params.id || '').trim()
  const lineId = String(req.params.lineId || '').trim()
  const body = req.body || {}
  const step = String(body.step || '').toLowerCase()
  const note = String(body.note || '').trim()
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  const by = String(req.admin?.email || 'admin')
  try {
    const result = await adminCompleteLineReturn(doc, lineId, {
      step,
      note,
      by,
      skipGateway: body.skipGateway === true,
    })
    if (step === 'refund' && result.refundAmount > 0) {
      await sendOrderRefundEmail({
        to: doc.customerEmail,
        orderId: doc.publicId,
        customerName: doc.customerName,
        amount: result.refundAmount,
        note: note || 'Return refund processed',
      }).catch(() => {})
    }
    await logAudit({
      adminEmail: req.admin?.email,
      action: `order.line.rma.${step}`,
      entityType: 'order',
      entityId: id,
      details: { lineId, step, refundAmount: result.refundAmount },
    })
    const payments = await listPaymentsForOrderPublicId(id)
    res.json(
      orderToClientJson(result.order, {
        payments: payments.map((p) => p.toJSON()),
      })
    )
  } catch (err) {
    res.status(400).json({ message: err.message || 'Line RMA action failed' })
  }
}

async function adminPatchOrder(req, res) {
  const { id } = req.params
  const body = req.body || {}
  const allowed = [
    'status',
    'paymentStatus',
    'trackingNumber',
    'courierPartner',
    'estimatedDeliveryAt',
    'cancelReason',
    'returnReason',
    'internalNotes',
    'customerEmail',
    'customerName',
    'subtotal',
    'shippingFee',
    'total',
    'shipping',
    'paymentMethod',
    'items',
    'date',
  ]
  const updates = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  const existing = await Order.findOne({ publicId: id })
  if (!existing) {
    return res.status(404).json({ message: 'Order not found' })
  }

  if (updates.status !== undefined) {
    const err = validateOrderTransition(existing.status, updates.status)
    if (err) return res.status(400).json({ message: err })
    if (normalizeLegacyOrderStatus(updates.status) === 'Packed') {
      const settings = await getOrCreateSettings()
      const packErr = canPackOrder(existing, settings.codConfirmThreshold)
      if (packErr) return res.status(400).json({ message: packErr })
    }
  }

  if (updates.paymentStatus !== undefined) {
    const err = validatePaymentTransition(existing.paymentStatus, updates.paymentStatus)
    if (err) return res.status(400).json({ message: err })
  }

  if (updates.status === 'Delivered') {
    const autoPaid = paymentStatusOnDelivered(existing)
    if (autoPaid !== existing.paymentStatus) {
      updates.paymentStatus = autoPaid
    }
    if (normalizeLegacyOrderStatus(existing.status) === 'Return Requested') {
      updates.returnRequestedAt = null
      updates.returnReason = ''
    }
  }

  const nextStatus = updates.status ?? existing.status
  const nextPaymentStatus = updates.paymentStatus ?? existing.paymentStatus
  const statusChanged =
    updates.status !== undefined && updates.status !== existing.status
  const paymentChanged =
    updates.paymentStatus !== undefined && updates.paymentStatus !== existing.paymentStatus

  if (statusChanged || paymentChanged) {
    const note = String(body.note || '').trim()
    let historyNote = note
    if (!historyNote) {
      if (statusChanged && paymentChanged) {
        historyNote = `Status → ${nextStatus}, Payment → ${nextPaymentStatus}`
      } else if (statusChanged) {
        historyNote = `Order ${nextStatus.toLowerCase()}`
      } else {
        historyNote = `Payment ${nextPaymentStatus}`
      }
    }
    updates.statusHistory = appendHistoryEntry(existing.statusHistory, {
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      note: historyNote,
      by: String(req.admin?.email || 'admin'),
    })
  }

  const nextStatusForInv = updates.status ?? existing.status
  const statusChangedForInv =
    updates.status !== undefined && updates.status !== existing.status

  if (
    statusChangedForInv &&
    isCommitStatus(nextStatusForInv) &&
    !existing.stockCommitted &&
    isPreCommitStatus(existing.status)
  ) {
    await commitOrderItems(Product, existing.items, null, existing.publicId)
    updates.stockCommitted = true
  }

  if (updates.status && shouldRestockOnStatus(updates.status) && existing.status !== updates.status) {
    const stockWasCommitted = existing.stockCommitted || updates.stockCommitted === true
    await restockOrderItems(
      Product,
      existing.items,
      null,
      existing.publicId,
      stockWasCommitted
    )
  }

  const prevStatus = existing.status
  const doc = await Order.findOneAndUpdate({ publicId: id }, { $set: updates }, { new: true })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }

  if (updates.paymentStatus !== undefined) {
    await syncLatestPaymentStatus(id, updates.paymentStatus)
  }

  if (statusChanged) {
    await notifyOrderStatusChange(doc, prevStatus)
  }

  const payments = await listPaymentsForOrderPublicId(id)

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'order.update',
    entityType: 'order',
    entityId: id,
    details: { status: doc.status, paymentStatus: doc.paymentStatus },
  })

  res.json({
    ...doc.toJSON(),
    payments: payments.map((p) => p.toJSON()),
  })
}

async function adminBulkOrders(req, res) {
  const { ids, action, note } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'ids array required' })
  }
  const validIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))]
  if (!validIds.length) {
    return res.status(400).json({ message: 'No valid order ids' })
  }

  const actionMap = {
    confirm: 'Confirmed',
    mark_packed: 'Packed',
    mark_shipped: 'Shipped',
    confirm_cod: '__cod__',
  }
  const targetStatus = actionMap[String(action || '').toLowerCase()]
  if (!targetStatus) {
    return res.status(400).json({ message: 'Unknown action. Use confirm, mark_packed, mark_shipped, or confirm_cod' })
  }

  const settings = await getOrCreateSettings()
  const results = { updated: 0, failed: [] }

  for (const id of validIds) {
    try {
      const existing = await Order.findOne({ publicId: id })
      if (!existing) {
        results.failed.push({ id, message: 'Not found' })
        continue
      }

      if (targetStatus === '__cod__') {
        if (!isCodPayment(existing.paymentMethod)) {
          results.failed.push({ id, message: 'Not a COD order' })
          continue
        }
        existing.codConfirmedAt = new Date()
        existing.codConfirmedBy = String(req.admin?.email || 'admin')
        existing.statusHistory = appendHistoryEntry(existing.statusHistory, {
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          note: note || 'COD order verified',
          by: String(req.admin?.email || 'admin'),
        })
        await existing.save()
        results.updated += 1
        continue
      }

      const err = validateOrderTransition(existing.status, targetStatus)
      if (err) {
        results.failed.push({ id, message: err })
        continue
      }
      if (targetStatus === 'Packed') {
        const packErr = canPackOrder(existing, settings.codConfirmThreshold)
        if (packErr) {
          results.failed.push({ id, message: packErr })
          continue
        }
      }

      const prevStatus = existing.status
      const history = appendHistoryEntry(existing.statusHistory, {
        status: targetStatus,
        paymentStatus: existing.paymentStatus,
        note: note || `Bulk ${action}`,
        by: String(req.admin?.email || 'admin'),
      })

      const updates = { status: targetStatus, statusHistory: history }
      if (targetStatus === 'Packed' && !existing.stockCommitted && isPreCommitStatus(existing.status)) {
        await commitOrderItems(Product, existing.items, null, existing.publicId)
        updates.stockCommitted = true
      }

      const doc = await Order.findOneAndUpdate({ publicId: id }, { $set: updates }, { new: true })
      await notifyOrderStatusChange(doc, prevStatus)
      results.updated += 1
    } catch (e) {
      results.failed.push({ id, message: e?.message || 'Update failed' })
    }
  }

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'order.bulk',
    entityType: 'order',
    entityId: validIds.join(','),
    details: { action, ...results },
  })

  res.json(results)
}

async function adminGetOrderInvoice(req, res) {
  const { id } = req.params
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  const settings = await getOrCreateSettings()
  const store = {
    storeName: settings.storeName,
    storeLocation: settings.storeLocation,
    storeState: settings.storeState,
    storeGstin: settings.storeGstin,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    defaultGstPercent: settings.defaultGstPercent,
    defaultHsnCode: settings.defaultHsnCode,
  }
  const orderPlain = doc.toObject()
  if (!orderPlain.invoiceNumber) {
    const invNo = String(doc.publicId).startsWith('ORD-')
      ? doc.publicId.replace('ORD-', 'INV-')
      : `INV-${doc.publicId}`
    orderPlain.invoiceNumber = invNo
    doc.invoiceNumber = invNo
    await doc.save()
  }
  const pdf = await generateGstInvoicePdf(orderPlain, store)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${orderPlain.invoiceNumber || id}.pdf"`)
  res.send(pdf)
}

async function adminConfirmCod(req, res) {
  const { id } = req.params
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  if (!isCodPayment(doc.paymentMethod)) {
    return res.status(400).json({ message: 'This is not a COD order' })
  }
  if (doc.codConfirmedAt) {
    return res.json(doc.toJSON())
  }
  const note = String(req.body?.note || 'COD verified — safe to pack').trim()
  doc.codConfirmedAt = new Date()
  doc.codConfirmedBy = String(req.admin?.email || 'admin')
  doc.statusHistory = appendHistoryEntry(doc.statusHistory, {
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    note,
    by: String(req.admin?.email || 'admin'),
  })
  await doc.save()

  await sendOrderStatusEmail({
    to: doc.customerEmail,
    orderId: doc.publicId,
    customerName: doc.customerName,
    status: 'Confirmed',
  }).catch(() => {})

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'order.cod_confirm',
    entityType: 'order',
    entityId: id,
    details: { total: doc.total },
  })

  const payments = await listPaymentsForOrderPublicId(id)
  res.json({
    ...doc.toJSON(),
    payments: payments.map((p) => p.toJSON()),
  })
}

async function adminProcessRefund(req, res) {
  const { id } = req.params
  const body = req.body || {}
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const orderTotal = round2(Number(doc.total) || 0)
  const priorRefunded = (doc.refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const maxRefundable = round2(orderTotal - priorRefunded)
  let amount = body.amount != null ? round2(body.amount) : maxRefundable
  if (amount <= 0 || amount > maxRefundable + 0.01) {
    return res.status(400).json({ message: `Refund amount must be between 0 and ${maxRefundable}` })
  }

  const reason = String(body.reason || '').trim()
  const note = String(body.note || '').trim()
  const by = String(req.admin?.email || 'admin')
  const payments = await listPaymentsForOrderPublicId(id)
  const razorpayPayment = payments.find((p) => p.provider === 'razorpay' && p.razorpayPaymentId)

  let refundRecord
  if (razorpayPayment && body.skipGateway !== true) {
    refundRecord = await processRazorpayRefund({
      order: doc,
      payment: razorpayPayment,
      amountInr: amount,
      reason,
      note,
      by,
    })
  } else {
    refundRecord = {
      amount,
      currency: 'INR',
      reason,
      note,
      razorpayRefundId: '',
      status: isCodPayment(doc.paymentMethod) ? 'manual_cod' : 'manual',
      provider: isCodPayment(doc.paymentMethod) ? 'cod' : 'manual',
      by,
      at: new Date(),
    }
  }

  const nextPaymentStatus = resolveRefundPaymentStatus(orderTotal, doc.refunds, amount)
  doc.refunds = [...(doc.refunds || []), refundRecord]
  doc.paymentStatus = nextPaymentStatus
  if (doc.rmaStatus && doc.rmaStatus !== 'refunded') {
    doc.rmaStatus = 'refunded'
  }
  doc.statusHistory = appendHistoryEntry(doc.statusHistory, {
    status: doc.status,
    paymentStatus: nextPaymentStatus,
    note: note || `Refund INR ${amount}${reason ? ` — ${reason}` : ''}`,
    by,
  })
  await doc.save()
  await applyRefundToPayment(id, nextPaymentStatus)

  await sendOrderRefundEmail({
    to: doc.customerEmail,
    orderId: doc.publicId,
    customerName: doc.customerName,
    amount,
    note: note || reason,
  }).catch(() => {})

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'order.refund',
    entityType: 'order',
    entityId: id,
    details: { amount, reason, razorpayRefundId: refundRecord.razorpayRefundId },
  })

  const updatedPayments = await listPaymentsForOrderPublicId(id)
  res.json({
    ...doc.toJSON(),
    payments: updatedPayments.map((p) => p.toJSON()),
  })
}

async function adminRmaAction(req, res) {
  const { id } = req.params
  const step = String(req.body?.step || '').toLowerCase()
  const note = String(req.body?.note || '').trim()
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  if (!doc.rmaId && doc.status !== 'Return Requested') {
    return res.status(400).json({ message: 'No active RMA for this order' })
  }

  const by = String(req.admin?.email || 'admin')
  const updates = {}
  let historyNote = note

  if (step === 'receive') {
    updates.rmaStatus = 'received'
    updates.returnReceivedAt = new Date()
    historyNote = historyNote || 'Return received at warehouse'
  } else if (step === 'restock') {
    updates.rmaStatus = 'restocked'
    updates.returnRestockedAt = new Date()
    updates.status = 'Returned'
    historyNote = historyNote || 'Items restocked'
    if (doc.status !== 'Returned') {
      const err = validateOrderTransition(doc.status, 'Returned')
      if (err) return res.status(400).json({ message: err })
    }
    const stockWasCommitted = doc.stockCommitted
    await restockOrderItems(Product, doc.items, null, doc.publicId, stockWasCommitted)
  } else if (step === 'refund') {
    return adminProcessRefund(req, res)
  } else {
    return res.status(400).json({ message: 'step must be receive, restock, or refund' })
  }

  updates.statusHistory = appendHistoryEntry(doc.statusHistory, {
    status: updates.status || doc.status,
    paymentStatus: doc.paymentStatus,
    note: historyNote,
    by,
  })

  const prevStatus = doc.status
  const updated = await Order.findOneAndUpdate({ publicId: id }, { $set: updates }, { new: true })
  if (updates.status && updates.status !== prevStatus) {
    await notifyOrderStatusChange(updated, prevStatus)
  }

  await logAudit({
    adminEmail: req.admin?.email,
    action: `order.rma.${step}`,
    entityType: 'order',
    entityId: id,
    details: { rmaId: updated.rmaId, rmaStatus: updated.rmaStatus },
  })

  const payments = await listPaymentsForOrderPublicId(id)
  res.json({
    ...updated.toJSON(),
    payments: payments.map((p) => p.toJSON()),
  })
}

async function adminGenerateCourierAwb(req, res) {
  const { id } = req.params
  const partner = String(req.body?.partner || 'delhivery').toLowerCase()
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const settings = await getOrCreateSettings()
  const store = {
    storeName: settings.storeName,
    storeLocation: settings.storeLocation,
    storeGstin: settings.storeGstin,
    defaultHsnCode: settings.defaultHsnCode,
  }

  const { courier: result } = await deliveryService.createShipmentForOrder({
    orderDoc: doc,
    store,
    partner,
    actorEmail: req.admin?.email,
  })

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'order.courier_awb',
    entityType: 'order',
    entityId: id,
    details: { partner: result.partner, awb: result.awb },
  })

  const payments = await listPaymentsForOrderPublicId(id)
  res.json({
    ...doc.toJSON(),
    payments: payments.map((p) => p.toJSON()),
    courier: result,
  })
}

async function adminGetCourierStatus(_req, res) {
  res.json(getCourierHealth())
}

module.exports = {
  customerRegister,
  customerLogin,
  customerGoogleLogin,
  customerForgotPasswordRequest,
  customerForgotPasswordVerifyOtp,
  customerForgotPasswordReset,
  customerGetMe,
  customerUpdateMe,
  customerGetCart,
  customerPutCart,
  customerGetWishlist,
  customerPutWishlist,
  customerQuoteCheckout,
  customerPlaceOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  customerListOrders,
  customerGetOrder,
  customerRequestCancel,
  customerRequestReturn,
  customerCancelLineItem,
  customerReturnLineItem,
  adminLogin,
  adminGetMe,
  adminChangePassword,
  adminListUsers,
  adminGetUser,
  adminPatchUser,
  adminPatchUserDisabled,
  adminListOrders,
  adminExportOrders,
  adminGetOrder,
  adminPatchOrder,
  adminBulkOrders,
  adminGetOrderInvoice,
  adminConfirmCod,
  adminProcessRefund,
  adminRmaAction,
  adminCancelLineItem,
  adminLineRmaAction,
  adminGenerateCourierAwb,
  adminGetCourierStatus,
}
