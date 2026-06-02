const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema({
  adminId: { type: String, default: '' },
  adminEmail: { type: String, default: '' },
  action: { type: String, default: '' },
  entityType: { type: String, default: '' },
  entityId: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
})

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ entityType: 1, entityId: 1 })

module.exports = mongoose.model('AuditLog', auditLogSchema)
