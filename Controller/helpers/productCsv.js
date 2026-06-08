const Product = require('../../Models/Product')
const { isValidObjectId } = require('./mongoIds')
const { toClientProduct } = require('../../Models/Product')

const EXPORT_COLUMNS = [
  'id',
  'name',
  'sku',
  'category',
  'subcategory',
  'price',
  'metalValue',
  'makingCharge',
  'useMakingChargePricing',
  'stock',
  'lowStockThreshold',
  'published',
  'publishAt',
  'sizeChartId',
]

function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cells[i] != null ? cells[i].trim() : ''
    })
    return row
  })
  return { headers, rows }
}

function productsToCsv(docs) {
  const header = EXPORT_COLUMNS.join(',')
  const rows = docs.map((doc) => {
    const p = doc.toJSON ? doc.toJSON() : toClientProduct(doc)
    return EXPORT_COLUMNS.map((col) => {
      if (col === 'publishAt') {
        return p.publishAt ? new Date(p.publishAt).toISOString() : ''
      }
      if (col === 'published') return p.published !== false ? 'true' : 'false'
      if (col === 'useMakingChargePricing') return p.useMakingChargePricing ? 'true' : 'false'
      return p[col] ?? ''
    })
      .map(escapeCsvCell)
      .join(',')
  })
  return [header, ...rows].join('\n')
}

function parseBool(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes') return true
  if (s === 'false' || s === '0' || s === 'no' || s === '') return false
  return null
}

function parseNum(raw) {
  if (raw === '' || raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function rowToProductUpdates(row) {
  const updates = {}
  if (row.name !== undefined && row.name !== '') updates.name = String(row.name).trim()
  if (row.sku !== undefined) updates.sku = String(row.sku).trim()
  if (row.category !== undefined && row.category !== '') updates.category = String(row.category).trim()
  if (row.subcategory !== undefined) updates.subcategory = String(row.subcategory).trim()
  const price = parseNum(row.price)
  if (price != null) updates.price = price
  const metalValue = parseNum(row.metalValue)
  if (metalValue != null) updates.metalValue = metalValue
  const makingCharge = parseNum(row.makingCharge)
  if (makingCharge != null) updates.makingCharge = makingCharge
  const useMc = parseBool(row.useMakingChargePricing)
  if (useMc != null) updates.useMakingChargePricing = useMc
  const stock = parseNum(row.stock)
  if (stock != null) updates.stock = Math.max(0, stock)
  const threshold = parseNum(row.lowStockThreshold)
  if (threshold != null) updates.lowStockThreshold = Math.max(0, threshold)
  const published = parseBool(row.published)
  if (published != null) updates.published = published
  if (row.publishAt !== undefined) {
    const raw = String(row.publishAt || '').trim()
    if (!raw) {
      updates.publishAt = null
    } else {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) updates.publishAt = d
    }
  }
  if (row.sizeChartId !== undefined) updates.sizeChartId = String(row.sizeChartId || '').trim()

  if (updates.useMakingChargePricing) {
    const metal = updates.metalValue != null ? updates.metalValue : 0
    const making = updates.makingCharge != null ? updates.makingCharge : 0
    updates.price = metal + making
  }

  return updates
}

async function importProductsFromCsv(text) {
  const { rows } = parseCsv(text)
  let created = 0
  let updated = 0
  let skipped = 0
  const errors = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const line = i + 2
    const updates = rowToProductUpdates(row)
    if (!updates.name && !row.id && !row.sku) {
      skipped++
      continue
    }

    try {
      let doc = null
      const id = String(row.id || '').trim()
      const sku = String(row.sku || '').trim()

      if (id && isValidObjectId(id)) {
        doc = await Product.findById(id)
      }
      if (!doc && sku) {
        doc = await Product.findOne({ sku })
      }

      if (doc) {
        Object.assign(doc, updates)
        if (doc.useMakingChargePricing) {
          doc.price = (Number(doc.metalValue) || 0) + (Number(doc.makingCharge) || 0)
        }
        await doc.save()
        updated++
      } else if (updates.name && updates.category) {
        const price =
          updates.useMakingChargePricing
            ? (updates.metalValue || 0) + (updates.makingCharge || 0)
            : updates.price ?? 0
        await Product.create({
          name: updates.name,
          sku: updates.sku || '',
          category: updates.category,
          subcategory: updates.subcategory || '',
          price,
          metalValue: updates.metalValue || 0,
          makingCharge: updates.makingCharge || 0,
          useMakingChargePricing: !!updates.useMakingChargePricing,
          stock: updates.stock != null ? updates.stock : 10,
          lowStockThreshold: updates.lowStockThreshold != null ? updates.lowStockThreshold : 5,
          published: updates.published !== false,
          publishAt: updates.publishAt || null,
          sizeChartId: updates.sizeChartId || '',
        })
        created++
      } else {
        errors.push(`Line ${line}: missing name or category for new product`)
        skipped++
      }
    } catch (e) {
      errors.push(`Line ${line}: ${e.message || 'import failed'}`)
      skipped++
    }
  }

  return { created, updated, skipped, errors }
}

module.exports = {
  EXPORT_COLUMNS,
  productsToCsv,
  importProductsFromCsv,
}
