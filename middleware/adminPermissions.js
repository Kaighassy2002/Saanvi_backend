const Admin = require('../Models/Admin')

const PERMISSIONS = [
  'dashboard',
  'orders',
  'catalog',
  'customers',
  'marketing',
  'analytics',
  'settings',
  'staff',
]

const PERMISSION_SET = new Set(PERMISSIONS)

const ROLE_LABELS = {
  owner: 'Owner — full access',
  admin: 'Administrator — full access',
  catalog: 'Catalog — products, inventory, size charts',
  fulfillment: 'Fulfillment — orders & shipping',
  support: 'Support — customers, orders, reviews',
}

const ROLE_DEFAULT_PERMISSIONS = {
  owner: [...PERMISSIONS],
  admin: [...PERMISSIONS],
  catalog: ['dashboard', 'catalog'],
  fulfillment: ['dashboard', 'orders'],
  support: ['dashboard', 'orders', 'customers', 'marketing'],
}

const STAFF_MANAGER_ROLES = new Set(['owner', 'admin'])

function normalizeRole(role) {
  return String(role || 'owner').toLowerCase().trim()
}

function sanitizePermissions(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(list.map((p) => String(p).toLowerCase().trim()).filter((p) => PERMISSION_SET.has(p)))]
}

function getRoleDefaultPermissions(role) {
  const key = normalizeRole(role)
  return ROLE_DEFAULT_PERMISSIONS[key] ? [...ROLE_DEFAULT_PERMISSIONS[key]] : []
}

function getEffectivePermissions(admin) {
  if (!admin) return new Set()
  const role = normalizeRole(admin.role)
  const explicit = sanitizePermissions(admin.permissions)
  const base = explicit.length ? explicit : getRoleDefaultPermissions(role)
  return new Set(base)
}

function hasPermission(admin, permission) {
  return getEffectivePermissions(admin).has(permission)
}

function canManageStaff(admin) {
  return hasPermission(admin, 'staff')
}

function isStaffManagerRole(role) {
  return STAFF_MANAGER_ROLES.has(normalizeRole(role))
}

function requirePermission(...required) {
  const needed = required.map((p) => String(p).toLowerCase())
  return (req, res, next) => {
    const perms = getEffectivePermissions(req.admin)
    if (needed.some((p) => perms.has(p))) return next()
    return res.status(403).json({ message: 'You do not have permission for this action' })
  }
}

async function loadAdminAccess(req, res, next) {
  try {
    const email = String(req.admin?.email || '')
      .toLowerCase()
      .trim()
    if (!email) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
    const admin = await Admin.findOne({ email }).select('email role permissions disabled name').lean()
    if (!admin || admin.disabled) {
      return res.status(401).json({ message: 'Account disabled or not found' })
    }
    req.admin = {
      email: admin.email,
      role: admin.role,
      name: admin.name || '',
      permissions: sanitizePermissions(admin.permissions),
      effectivePermissions: [...getEffectivePermissions(admin)],
    }
    next()
  } catch {
    return res.status(500).json({ message: 'Could not verify admin access' })
  }
}

module.exports = {
  PERMISSIONS,
  PERMISSION_SET,
  ROLE_LABELS,
  ROLE_DEFAULT_PERMISSIONS,
  STAFF_MANAGER_ROLES,
  normalizeRole,
  sanitizePermissions,
  getRoleDefaultPermissions,
  getEffectivePermissions,
  hasPermission,
  canManageStaff,
  isStaffManagerRole,
  requirePermission,
  loadAdminAccess,
}
