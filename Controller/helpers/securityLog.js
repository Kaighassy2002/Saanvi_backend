const SecurityEvent = require('../../Models/SecurityEvent')

function requestMeta(req) {
  if (!req) return { ip: '', userAgent: '', requestId: '' }
  const ip =
    (typeof req.ip === 'string' && req.ip) ||
    String(req.headers?.['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    ''
  return {
    ip,
    userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300),
    requestId: String(req.headers?.['x-request-id'] || req.id || '').slice(0, 80),
  }
}

/**
 * Persist a security event. Never throws to callers — logging must not break checkout.
 */
async function logSecurityEvent({
  category,
  action,
  severity = 'info',
  actorType = 'system',
  actorId = '',
  actorEmail = '',
  entityType = '',
  entityId = '',
  details = {},
  req = null,
}) {
  try {
    const meta = requestMeta(req)
    const doc = {
      category: String(category || 'suspicious'),
      action: String(action || 'unknown'),
      severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'info',
      actorType: ['customer', 'admin', 'system', 'anonymous'].includes(actorType)
        ? actorType
        : 'system',
      actorId: String(actorId || ''),
      actorEmail: String(actorEmail || '').toLowerCase(),
      entityType: String(entityType || ''),
      entityId: String(entityId || ''),
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
      details: details && typeof details === 'object' ? details : {},
      createdAt: new Date(),
    }
    await SecurityEvent.create(doc)

    if (severity === 'critical' || severity === 'warning') {
      console.warn(
        `[security:${severity}] ${doc.category}/${doc.action}`,
        JSON.stringify({
          actorType: doc.actorType,
          actorId: doc.actorId,
          entityId: doc.entityId,
          ip: doc.ip,
        })
      )
    }
  } catch (err) {
    console.error('Security log failed:', err?.message || err)
  }
}

module.exports = { logSecurityEvent, requestMeta }
