const Category = require('../Models/Category')
const { isValidObjectId } = require('./helpers/mongoIds')

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function adminListCategories(_req, res) {
  const docs = await Category.find().sort({ sortOrder: 1, name: 1 })
  res.json({ categories: docs.map((d) => d.toJSON()) })
}

async function adminCreateCategory(req, res) {
  const body = req.body || {}
  const name = String(body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'name required' })
  const doc = await Category.create({
    name,
    slug: body.slug ? slugify(body.slug) : slugify(name),
    parentId: String(body.parentId || ''),
    image: String(body.image || ''),
    description: String(body.description || ''),
    sortOrder: Number(body.sortOrder) || 0,
    seoTitle: String(body.seoTitle || ''),
    seoDescription: String(body.seoDescription || ''),
    fieldDefinitions: Array.isArray(body.fieldDefinitions) ? body.fieldDefinitions : [],
  })
  res.status(201).json(doc.toJSON())
}

async function adminUpdateCategory(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Category not found' })
  const body = req.body || {}
  const updates = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.slug !== undefined) updates.slug = slugify(body.slug)
  if (body.parentId !== undefined) updates.parentId = String(body.parentId)
  if (body.image !== undefined) updates.image = String(body.image)
  if (body.description !== undefined) updates.description = String(body.description)
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder)
  if (body.seoTitle !== undefined) updates.seoTitle = String(body.seoTitle)
  if (body.seoDescription !== undefined) updates.seoDescription = String(body.seoDescription)
  if (body.fieldDefinitions !== undefined) updates.fieldDefinitions = body.fieldDefinitions
  const doc = await Category.findByIdAndUpdate(id, { $set: updates }, { new: true })
  if (!doc) return res.status(404).json({ message: 'Category not found' })
  res.json(doc.toJSON())
}

async function adminDeleteCategory(req, res) {
  const { id } = req.params
  if (!isValidObjectId(id)) return res.status(404).json({ message: 'Category not found' })
  const doc = await Category.findByIdAndDelete(id)
  if (!doc) return res.status(404).json({ message: 'Category not found' })
  res.status(204).end()
}

module.exports = {
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
}
