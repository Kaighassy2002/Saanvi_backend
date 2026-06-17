const mongoose = require('mongoose')

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '', trim: true },
    role: {
      type: String,
      enum: ['owner', 'catalog', 'fulfillment', 'support', 'admin'],
      default: 'owner',
    },
    permissions: {
      type: [String],
      default: [],
    },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Admin', adminSchema)
