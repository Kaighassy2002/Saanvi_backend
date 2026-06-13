const mongoose = require('mongoose')

const addressSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: '' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
  },
  { _id: false }
)

const customerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  googleId: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String, select: false },
  firstName: { type: String, default: '', trim: true },
  lastName: { type: String, default: '', trim: true },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  addresses: { type: [addressSchema], default: [] },
  savedCart: { type: [mongoose.Schema.Types.Mixed], default: [] },
  savedWishlist: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  adminNotes: { type: String, default: '' },
  tags: { type: [String], default: [] },
})

customerSchema.statics.buildDisplayName = function buildDisplayName(firstName, lastName) {
  return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ')
}

customerSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    const o = { ...ret }
    o.id = String(o._id)
    delete o._id
    delete o.__v
    delete o.passwordHash
    return o
  },
})

module.exports = mongoose.model('Customer', customerSchema)
