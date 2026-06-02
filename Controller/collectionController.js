const Collection = require('../Models/Collection')
const { isValidObjectId } = require('./helpers/mongoIds')

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function adminListCollections(_req, res) {
  const docs = await Collection.find().sort({ sortOrder: 1, name: 1 })
  res.json({ collections: docs.map((d) => d.toJSON()) })
}

async function adminCreateCollection(req, res) {
  const body = req.body || {}
  const name = String(body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'name required' })
  const doc = await Collection.create({
    name,
    slug: body.slug ? slugify(body.slug) : slugify(name),
    heroImage: String(body.heroImage || ''),
    description: String(body.description || ''),
    productIds: Array.isArray(body.productIds) ? body.productIds.map(String) : [],
    published: body.published !== false,
    sortOrder: Number(body.sortOrder) || 0,
  })
  res.status(201).json(doc.toJSON())
}

async function adminUpdateCollection(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Collection not found' })
  const body = req.body || {}
  const updates = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.slug !== undefined) updates.slug = slugify(body.slug)
  if (body.heroImage !== undefined) updates.heroImage = String(body.heroImage)
  if (body.description !== undefined) updates.description = String(body.description)
  if (body.productIds !== undefined) updates.productIds = body.productIds.map(String)
  if (body.published !== undefined) updates.published = !!body.published
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder)
  const doc = await Collection.findByIdAndUpdate(id, { $set: updates }, { new: true })
  if (!doc) return res.status(404).json({ message: 'Collection not found' })
  res.json(doc.toJSON())
}

async function adminDeleteCollection(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Collection not found' })
  const doc = await Collection.findByIdAndDelete(id)
  if (!doc) return res.status(404).json({ message: 'Collection not found' })
  res.status(204).end()
}

module.exports = {
  adminListCollections,
  adminCreateCollection,
  adminUpdateCollection,
  adminDeleteCollection,
}
