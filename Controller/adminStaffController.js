const bcrypt = require('bcryptjs')
const Admin = require('../Models/Admin')
const { logAudit } = require('./helpers/auditLog')
const { isValidObjectId } = require('./helpers/mongoIds')
const {
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_DEFAULT_PERMISSIONS,
  normalizeRole,
  sanitizePermissions,
  getRoleDefaultPermissions,
  canManageStaff,
  isStaffManagerRole,
} = require('../middleware/adminPermissions')

const MIN_PASSWORD_LEN = 8
const ASSIGNABLE_ROLES = ['admin', 'catalog', 'fulfillment', 'support']

function staffPublicJson(doc) {
  const role = normalizeRole(doc.role)
  const permissions = sanitizePermissions(doc.permissions)
  const effectivePermissions = permissions.length ? permissions : getRoleDefaultPermissions(role)
  return {
    id: String(doc._id),
    email: doc.email,
    name: doc.name || '',
    role,
    permissions,
    effectivePermissions,
    disabled: Boolean(doc.disabled),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function assertStaffManager(req, res) {
  if (!canManageStaff(req.admin)) {
    res.status(403).json({ message: 'You do not have permission to manage staff' })
    return false
  }
  return true
}

async function adminGetPermissionsMeta(_req, res) {
  res.json({
    permissions: PERMISSIONS.map((key) => ({
      key,
      label: {
        dashboard: 'Dashboard',
        orders: 'Orders',
        catalog: 'Catalog & inventory',
        customers: 'Customers',
        marketing: 'Marketing & reviews',
        analytics: 'Analytics',
        settings: 'Store settings',
        staff: 'Staff management',
      }[key],
    })),
    roles: Object.entries(ROLE_LABELS).map(([key, label]) => ({
      key,
      label,
      defaultPermissions: ROLE_DEFAULT_PERMISSIONS[key] || [],
    })),
    assignableRoles: ASSIGNABLE_ROLES,
  })
}

async function adminListStaff(req, res) {
  if (!assertStaffManager(req, res)) return
  const items = await Admin.find({ role: { $in: ASSIGNABLE_ROLES } })
    .select('email name role permissions disabled createdAt updatedAt')
    .sort({ createdAt: 1 })
    .lean()
  res.json({ items: items.map(staffPublicJson) })
}

async function adminCreateStaff(req, res) {
  if (!assertStaffManager(req, res)) return

  const body = req.body || {}
  const email = String(body.email || '')
    .toLowerCase()
    .trim()
  const password = String(body.password || '')
  const name = String(body.name || '').trim()
  let role = normalizeRole(body.role || 'support')
  const permissions = sanitizePermissions(body.permissions)

  if (!email) {
    return res.status(400).json({ message: 'Email is required' })
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LEN} characters` })
  }
  if (role === 'owner') {
    if (!isStaffManagerRole(req.admin.role)) {
      return res.status(403).json({ message: 'Only owners can create owner accounts' })
    }
  } else if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' })
  }

  const existing = await Admin.findOne({ email })
  if (existing) {
    return res.status(409).json({ message: 'An account with this email already exists' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const doc = await Admin.create({
    email,
    passwordHash,
    name,
    role,
    permissions,
    disabled: false,
  })

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'staff.create',
    entityType: 'admin',
    entityId: String(doc._id),
    details: { email, role, permissions },
  })

  res.status(201).json(staffPublicJson(doc))
}

async function adminUpdateStaff(req, res) {
  if (!assertStaffManager(req, res)) return

  const id = String(req.params.id || '').trim()
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid staff id' })
  }

  const doc = await Admin.findById(id)
  if (!doc) {
    return res.status(404).json({ message: 'Staff account not found' })
  }

  const body = req.body || {}
  const selfId = await Admin.findOne({ email: req.admin.email }).select('_id').lean()
  const isSelf = selfId && String(selfId._id) === id

  if (body.disabled === true && isSelf) {
    return res.status(400).json({ message: 'You cannot disable your own account' })
  }

  if (body.name !== undefined) {
    doc.name = String(body.name || '').trim()
  }

  if (body.role !== undefined) {
    const nextRole = normalizeRole(body.role)
    if (nextRole === 'owner' && normalizeRole(req.admin.role) !== 'owner') {
      return res.status(403).json({ message: 'Only owners can assign the owner role' })
    }
    if (nextRole !== 'owner' && !ASSIGNABLE_ROLES.includes(nextRole)) {
      return res.status(400).json({ message: 'Invalid role' })
    }
    if (isSelf && nextRole !== normalizeRole(doc.role)) {
      return res.status(400).json({ message: 'You cannot change your own role' })
    }
    doc.role = nextRole
  }

  if (body.permissions !== undefined) {
    if (isSelf) {
      return res.status(400).json({ message: 'You cannot change your own permissions' })
    }
    doc.permissions = sanitizePermissions(body.permissions)
  }

  if (body.disabled !== undefined) {
    if (body.disabled && normalizeRole(doc.role) === 'owner') {
      const ownerCount = await Admin.countDocuments({ role: 'owner', disabled: { $ne: true } })
      if (ownerCount <= 1) {
        return res.status(400).json({ message: 'Cannot disable the only active owner account' })
      }
    }
    doc.disabled = Boolean(body.disabled)
  }

  const newPassword = body.newPassword != null ? String(body.newPassword) : ''
  if (newPassword) {
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LEN} characters` })
    }
    doc.passwordHash = await bcrypt.hash(newPassword, 10)
  }

  await doc.save()

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'staff.update',
    entityType: 'admin',
    entityId: id,
    details: {
      email: doc.email,
      role: doc.role,
      disabled: doc.disabled,
      permissions: doc.permissions,
      passwordReset: Boolean(newPassword),
    },
  })

  res.json(staffPublicJson(doc))
}

async function adminDeleteStaff(req, res) {
  if (!assertStaffManager(req, res)) return

  const id = String(req.params.id || '').trim()
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid staff id' })
  }

  const doc = await Admin.findById(id)
  if (!doc) {
    return res.status(404).json({ message: 'Staff account not found' })
  }

  const self = await Admin.findOne({ email: req.admin.email }).select('_id').lean()
  if (self && String(self._id) === id) {
    return res.status(400).json({ message: 'You cannot delete your own account' })
  }

  if (normalizeRole(doc.role) === 'owner') {
    const ownerCount = await Admin.countDocuments({ role: 'owner' })
    if (ownerCount <= 1) {
      return res.status(400).json({ message: 'Cannot delete the only owner account' })
    }
  }

  await doc.deleteOne()

  await logAudit({
    adminEmail: req.admin?.email,
    action: 'staff.delete',
    entityType: 'admin',
    entityId: id,
    details: { email: doc.email },
  })

  res.json({ ok: true })
}

module.exports = {
  adminGetPermissionsMeta,
  adminListStaff,
  adminCreateStaff,
  adminUpdateStaff,
  adminDeleteStaff,
}
