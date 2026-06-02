function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(String(query.limit || String(defaultLimit)), 10) || defaultLimit)
  )
  const skip = (page - 1) * limit
  const sort = String(query.sort || '-createdAt')
  const q = String(query.q || '').trim()
  return { page, limit, skip, sort, q }
}

function paginatedResponse(items, total, page, limit) {
  const pages = Math.max(1, Math.ceil(total / limit) || 1)
  return {
    items,
    total,
    page,
    limit,
    pages,
    // backward compatibility
    products: items,
    orders: items,
    users: items,
  }
}

function parseSort(sortStr, allowed = {}) {
  const raw = String(sortStr || '-createdAt')
  const desc = raw.startsWith('-')
  const field = desc ? raw.slice(1) : raw
  const key = allowed[field] || field
  return { [key]: desc ? -1 : 1 }
}

module.exports = { parsePagination, paginatedResponse, parseSort }
