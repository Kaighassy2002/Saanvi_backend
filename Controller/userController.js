const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../Models/Admin')
const Customer = require('../Models/Customer')
const Order = require('../Models/Order')
const PasswordResetOtp = require('../Models/PasswordResetOtp')
const { sendPasswordResetOtpEmail } = require('./helpers/otpEmail')
const { isValidObjectId } = require('./helpers/mongoIds')

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
  const token = jwt.sign({ role: 'admin', email: admin.email }, secret, { expiresIn: '7d' })
  res.json({
    token,
    user: { email: admin.email, role: 'admin' },
  })
}

// --- admin customers ---

async function adminListUsers(_req, res) {
  const docs = await Customer.find().sort({ createdAt: -1 })
  res.json({ users: docs.map((d) => d.toJSON()) })
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
    if (line.price == null || Number(line.price) < 0) return 'Invalid line item price'
  }
  const total = Number(body.total)
  if (Number.isNaN(total) || total < 0) return 'Invalid order total'
  return null
}

// --- storefront orders (persisted in MongoDB) ---

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
  const customerName = `${shipping.firstName} ${shipping.lastName}`.trim()
  const publicId = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const date = new Date().toISOString().slice(0, 10)
  const customerUserId = String(req.customer.sub)
  const doc = await Order.create({
    publicId,
    date,
    status: 'Processing',
    total: Number(body.total),
    customerEmail: shipping.email,
    customerName,
    shipping,
    paymentMethod: String(body.paymentMethod || 'card'),
    trackingNumber: '',
    internalNotes: '',
    placedVia: 'storefront',
    customerUserId,
    items: body.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: Number(i.quantity),
      price: Number(i.price),
      image: i.image || '',
    })),
  })
  res.status(201).json(doc.toJSON())
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

async function adminListOrders(_req, res) {
  const docs = await Order.find().sort({ date: -1 })
  res.json({ orders: docs.map((d) => d.toJSON()) })
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
    'trackingNumber',
    'internalNotes',
    'customerEmail',
    'customerName',
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
  const doc = await Order.findOneAndUpdate({ publicId: id }, { $set: updates }, { new: true })
  if (!doc) {
    return res.status(404).json({ message: 'Order not found' })
  }
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
  customerPlaceOrder,
  customerListOrders,
  adminLogin,
  adminListUsers,
  adminPatchUserDisabled,
  adminListOrders,
  adminGetOrder,
  adminPatchOrder,
}
