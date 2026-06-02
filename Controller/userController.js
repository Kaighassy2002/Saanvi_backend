const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const Admin = require('../Models/Admin')
const Customer = require('../Models/Customer')
const Order = require('../Models/Order')
const Product = require('../Models/Product')
const PasswordResetOtp = require('../Models/PasswordResetOtp')
const { sendPasswordResetOtpEmail, sendOrderConfirmationEmail } = require('./helpers/otpEmail')
const { isValidObjectId } = require('./helpers/mongoIds')
const { getShippingSettings, computeShippingFee } = require('./helpers/siteSettings')
const {
  RAZORPAY_CURRENCY,
  isRazorpayConfigured,
  getPublicKeyId,
  razorpayClient,
  verifyPaymentSignature,
  assertRazorpayPaymentCaptured,
} = require('./helpers/razorpay')
const { resolveAndMaybeDecrementLine, restockLine } = require('./helpers/orderLineStock')

const MIN_PASSWORD_LEN = 8
const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5
const RESET_TOKEN_EXPIRY = '10m'

function customerPublicJson(doc) {
  const o = doc.toJSON()
  return {
    id: o.id,
    email: o.email,
    name: o.name || '',
    firstName: o.firstName || '',
    lastName: o.lastName || '',
    phone: o.phone || '',
    addresses: Array.isArray(o.addresses) ? o.addresses : [],
  }
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
  return String(Math.floor(Math.random() * (max - min)) + min)
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
  const customer = await Customer.findById(req.customer.sub)
  if (!customer || customer.disabled) {
    return res.status(404).json({ message: 'User not found' })
  }
  res.json(customerPublicJson(customer))
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
  const fresh = await Customer.findById(customer._id)
  res.json(customerPublicJson(fresh))
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
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }
  const role = admin.role || 'owner'
  const token = jwt.sign({ role, email: admin.email }, secret, { expiresIn: '7d' })
  res.json({
    token,
    user: { email: admin.email, role },
  })
}

// --- admin customers ---

const { parsePagination, paginatedResponse } = require('./helpers/pagination')
const { logAudit } = require('./helpers/auditLog')

async function adminListUsers(req, res) {
  const { page, limit, skip, q } = parsePagination(req.query)
  const filter = {}
  if (q) {
    filter.$or = [
      { email: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
      { firstName: { $regex: q, $options: 'i' } },
      { lastName: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
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

async function buildVerifiedOrderItems(rawItems, session) {
  const verifiedItems = []
  let subtotal = 0

  for (const line of rawItems) {
    const quantity = Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error('Invalid line item quantity')
    }
    const resolved = await resolveAndMaybeDecrementLine(
      Product,
      {
        productId: String(line.productId),
        quantity,
        variantKey: line.variantKey || line.variantName,
        variantName: line.variantKey || line.variantName,
        name: line.name,
      },
      { session, decrement: true }
    )
    subtotal += resolved.price * quantity
    const item = {
      productId: resolved.productId,
      name: resolved.name,
      quantity: resolved.quantity,
      price: resolved.price,
      image: resolved.image,
    }
    if (resolved.variantName) item.variantName = resolved.variantName
    verifiedItems.push(item)
  }

  const shippingFee = await getShippingFee(subtotal)
  const total = subtotal + shippingFee
  return { verifiedItems, subtotal, shippingFee, total }
}

async function placeOrderWithoutTransaction({ body, shipping, customerName, publicId, date, customerUserId }) {
  const decremented = []
  try {
    const verifiedItems = []
    let subtotal = 0
    for (const line of body.items) {
      const quantity = Number(line.quantity)
      const resolved = await resolveAndMaybeDecrementLine(
        Product,
        {
          productId: String(line.productId),
          quantity,
          variantKey: line.variantKey || line.variantName,
          variantName: line.variantKey || line.variantName,
          name: line.name,
        },
        { decrement: true }
      )
      decremented.push(resolved.restock)
      subtotal += resolved.price * quantity
      const item = {
        productId: resolved.productId,
        name: resolved.name,
        quantity: resolved.quantity,
        price: resolved.price,
        image: resolved.image,
      }
      if (resolved.variantName) item.variantName = resolved.variantName
      verifiedItems.push(item)
    }
    const shippingFee = await getShippingFee(subtotal)
    const total = subtotal + shippingFee
    if (!verifyClientTotal(body.total, total)) {
      throw new Error('Order total mismatch. Please refresh cart and try again.')
    }
    return await Order.create({
      publicId,
      date,
      status: 'Processing',
      subtotal,
      shippingFee,
      total,
      customerEmail: shipping.email,
      customerName,
      shipping,
      paymentMethod: normalizePaymentMethod(body.paymentMethod),
      trackingNumber: '',
      internalNotes: '',
      placedVia: 'storefront',
      paymentStatus: normalizePaymentMethod(body.paymentMethod) === 'cod' ? 'pending' : 'paid',
      customerUserId,
      items: verifiedItems,
    })
  } catch (err) {
    for (const row of decremented) {
      if (row) await restockLine(Product, row)
    }
    throw err
  }
}

async function quoteVerifiedItems(rawItems) {
  const quotedItems = []
  let subtotal = 0
  for (const line of rawItems) {
    const quantity = Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error('Invalid line item quantity')
    }
    const productId = String(line.productId)
    if (!isValidObjectId(productId)) {
      throw new Error('Invalid product in cart')
    }
    const resolved = await resolveAndMaybeDecrementLine(
      Product,
      {
        productId,
        quantity,
        variantKey: line.variantKey || line.variantName,
        variantName: line.variantKey || line.variantName,
        name: line.name,
      },
      { decrement: false }
    )
    subtotal += resolved.price * quantity
    const item = {
      productId: resolved.productId,
      name: resolved.name,
      quantity: resolved.quantity,
      price: resolved.price,
      image: resolved.image,
    }
    if (resolved.variantName) item.variantName = resolved.variantName
    quotedItems.push(item)
  }
  const shippingFee = await getShippingFee(subtotal)
  const total = subtotal + shippingFee
  return { quotedItems, subtotal, shippingFee, total }
}

async function createPaidStorefrontOrder({
  body,
  shipping,
  customerUserId,
  paymentStatus,
  razorpayOrderId = '',
  razorpayPaymentId = '',
}) {
  const customerName = `${shipping.firstName} ${shipping.lastName}`.trim()
  const publicId = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const date = new Date().toISOString().slice(0, 10)
  const session = await mongoose.startSession()
  let doc
  try {
    session.startTransaction()
    const { verifiedItems, subtotal, shippingFee, total } = await buildVerifiedOrderItems(body.items, session)
    if (!verifyClientTotal(body.total, total)) {
      throw new Error('Order total mismatch. Please refresh cart and try again.')
    }
    ;[doc] = await Order.create(
      [
        {
          publicId,
          date,
          status: 'Processing',
          subtotal,
          shippingFee,
          total,
          customerEmail: shipping.email,
          customerName,
          shipping,
          paymentMethod: normalizePaymentMethod(body.paymentMethod),
          paymentStatus,
          razorpayOrderId: String(razorpayOrderId || ''),
          razorpayPaymentId: String(razorpayPaymentId || ''),
          trackingNumber: '',
          internalNotes: '',
          placedVia: 'storefront',
          customerUserId,
          items: verifiedItems,
        },
      ],
      { session }
    )
    await session.commitTransaction()
  } catch (err) {
    await session.abortTransaction()
    const msg = String(err?.message || '')
    const transactionUnavailable =
      msg.includes('Transaction numbers are only allowed on a replica set member') ||
      msg.includes('Transaction support is disabled')
    if (transactionUnavailable) {
      doc = await placeOrderWithoutTransaction({
        body,
        shipping,
        customerName,
        publicId,
        date,
        customerUserId,
      })
    } else {
      throw err
    }
  } finally {
    await session.endSession()
  }
  return doc
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
  let doc
  try {
    doc = await createPaidStorefrontOrder({
      body,
      shipping,
      customerUserId,
      paymentStatus: normalizePaymentMethod(body.paymentMethod) === 'cod' ? 'pending' : 'paid',
    })
  } catch (err) {
    return res.status(400).json({ message: err?.message || 'Could not place order' })
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
  const { subtotal, shippingFee, total } = await quoteVerifiedItems(items)
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
  const rp = razorpayClient()
  try {
    const { total } = await quoteVerifiedItems(body.items || [])
    if (!verifyClientTotal(body.total, total)) {
      return res.status(400).json({ message: 'Order total mismatch. Please refresh cart and try again.' })
    }
    await assertRazorpayPaymentCaptured(rp, {
      razorpayOrderId,
      razorpayPaymentId,
      expectedTotalInr: total,
    })
    const doc = await createPaidStorefrontOrder({
      body: {
        items: body.items,
        total: body.total,
        paymentMethod: body.paymentMethod || 'razorpay',
      },
      shipping: { firstName, lastName, email, phone, address, city, state, pincode },
      customerUserId: String(req.customer.sub),
      paymentStatus: 'paid',
      razorpayOrderId,
      razorpayPaymentId,
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
    res.status(201).json(doc.toJSON())
  } catch (err) {
    const msg = err?.message || 'Could not finalize payment order'
    const status = msg.includes('verification') || msg.includes('mismatch') ? 400 : 502
    res.status(status).json({ message: msg })
  }
}

async function customerListOrders(req, res) {
  const sub = String(req.customer.sub)
  const customer = await Customer.findById(sub).select('email')
  const email = (customer?.email || req.customer.email || '').toLowerCase().trim()
  const docs = await Order.find({
    $or: [{ customerUserId: sub }, { customerEmail: email }],
  }).sort({ date: -1 })
  res.json({ orders: docs.map((d) => d.toJSON()) })
}

// --- admin orders ---

async function adminListOrders(req, res) {
  const { page, limit, skip, q } = parsePagination(req.query)
  const filter = {}
  if (req.query.status && req.query.status !== 'All') {
    filter.status = String(req.query.status)
  }
  if (q) {
    filter.$or = [
      { publicId: { $regex: q, $options: 'i' } },
      { customerEmail: { $regex: q, $options: 'i' } },
      { customerName: { $regex: q, $options: 'i' } },
      { 'shipping.phone': { $regex: q, $options: 'i' } },
    ]
  }
  if (req.query.from || req.query.to) {
    filter.date = {}
    if (req.query.from) filter.date.$gte = String(req.query.from)
    if (req.query.to) filter.date.$lte = String(req.query.to)
  }
  const [docs, total] = await Promise.all([
    Order.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ])
  const items = docs.map((d) => d.toJSON())
  res.json(paginatedResponse(items, total, page, limit))
}

async function adminExportOrders(_req, res) {
  const docs = await Order.find().sort({ date: -1 }).lean()
  const header = ['id', 'date', 'status', 'paymentStatus', 'customerName', 'customerEmail', 'total']
  const rows = docs.map((o) =>
    [
      o.publicId,
      o.date,
      o.status,
      o.paymentStatus,
      o.customerName,
      o.customerEmail,
      o.total,
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
  const { id } = req.params
  const doc = await Order.findOne({ publicId: id })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
  res.json(doc.toJSON())
}

async function adminPatchOrder(req, res) {
  const { id } = req.params
  const body = req.body || {}
  const allowed = [
    'status',
    'paymentStatus',
    'trackingNumber',
    'internalNotes',
    'customerEmail',
    'customerName',
    'subtotal',
    'shippingFee',
    'total',
    'shipping',
    'paymentMethod',
    'razorpayOrderId',
    'razorpayPaymentId',
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

  if (updates.status !== undefined || updates.paymentStatus !== undefined) {
    const history = Array.isArray(existing.statusHistory) ? [...existing.statusHistory] : []
    history.push({
      status: updates.status ?? existing.status,
      paymentStatus: updates.paymentStatus ?? existing.paymentStatus,
      note: String(body.note || updates.internalNotes || ''),
      at: new Date(),
      by: String(req.admin?.email || 'admin'),
    })
    updates.statusHistory = history
  }

  const doc = await Order.findOneAndUpdate({ publicId: id }, { $set: updates }, { new: true })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'order.update',
    entityType: 'order',
    entityId: id,
    details: { status: doc.status, paymentStatus: doc.paymentStatus },
  })

  res.json(doc.toJSON())
}

module.exports = {
  customerRegister,
  customerLogin,
  customerForgotPasswordRequest,
  customerForgotPasswordVerifyOtp,
  customerForgotPasswordReset,
  customerGetMe,
  customerUpdateMe,
  customerGetCart,
  customerPutCart,
  customerGetWishlist,
  customerPutWishlist,
  customerPlaceOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  customerListOrders,
  adminLogin,
  adminListUsers,
  adminGetUser,
  adminPatchUser,
  adminPatchUserDisabled,
  adminListOrders,
  adminExportOrders,
  adminGetOrder,
  adminPatchOrder,
}
