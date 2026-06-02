const AuditLog = require('../../Models/AuditLog')

async function logAudit({ adminId, adminEmail, action, entityType, entityId, details }) {
  try {
    await AuditLog.create({
      adminId: adminId || '',
      adminEmail: adminEmail || '',
      action: String(action || ''),
      entityType: String(entityType || ''),
      entityId: String(entityId || ''),
      details: details || {},
      createdAt: new Date(),
    })
  } catch (err) {
    console.error('Audit log failed:', err.message)
  }
}

module.exports = { logAudit }
