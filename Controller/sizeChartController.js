const SizeChart = require('../Models/SizeChart')
const { isValidObjectId } = require('./helpers/mongoIds')

async function adminListSizeCharts(_req, res) {
  const docs = await SizeChart.find().sort({ name: 1 })
  res.json({ sizeCharts: docs.map((d) => d.toJSON()) })
}

async function adminCreateSizeChart(req, res) {
  const body = req.body || {}
  const name = String(body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'name required' })
  const doc = await SizeChart.create({
    name,
    type: body.type || 'general',
    categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds.map(String) : [],
    rows: Array.isArray(body.rows) ? body.rows : [],
  })
  res.status(201).json(doc.toJSON())
}

async function adminUpdateSizeChart(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Size chart not found' })
  const body = req.body || {}
  const updates = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.type !== undefined) updates.type = body.type
  if (body.categoryIds !== undefined) updates.categoryIds = body.categoryIds.map(String)
  if (body.rows !== undefined) updates.rows = body.rows
  const doc = await SizeChart.findByIdAndUpdate(id, { $set: updates }, { new: true })
  if (!doc) return res.status(404).json({ message: 'Size chart not found' })
  res.json(doc.toJSON())
}

async function adminDeleteSizeChart(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Size chart not found' })
  await SizeChart.findByIdAndDelete(id)
  res.status(204).end()
}

module.exports = {
  adminListSizeCharts,
  adminCreateSizeChart,
  adminUpdateSizeChart,
  adminDeleteSizeChart,
}
