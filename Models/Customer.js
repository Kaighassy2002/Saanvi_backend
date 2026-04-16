const mongoose = require('mongoose')

const customerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  firstName: { type: String, default: '', trim: true },
  lastName: { type: String, default: '', trim: true },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  createdAt: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
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
