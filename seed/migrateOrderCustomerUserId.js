/**
 * One-time migration: backfill customerUserId on legacy orders matched only by email.
 * Run after the order IDOR fix so existing customers retain access to old orders.
 *
 * Usage: node seed/migrateOrderCustomerUserId.js
 */
require('../instrument')

const { connectDb } = require('../DB/connection')
const Customer = require('../Models/Customer')
const Order = require('../Models/Order')

async function migrateOrderCustomerUserId() {
  await connectDb()
  const customers = await Customer.find().select('email').lean()
  let updated = 0

  for (const customer of customers) {
    const email = String(customer.email || '')
      .toLowerCase()
      .trim()
    if (!email) continue

    const result = await Order.updateMany(
      {
        customerEmail: email,
        $or: [{ customerUserId: '' }, { customerUserId: null }, { customerUserId: { $exists: false } }],
      },
      { $set: { customerUserId: String(customer._id) } }
    )
    updated += result.modifiedCount || 0
  }

  console.log(`Backfilled customerUserId on ${updated} order(s).`)
  process.exit(0)
}

migrateOrderCustomerUserId().catch((err) => {
  console.error(err)
  process.exit(1)
})
