require('dotenv').config()
const mongoose = require('mongoose')
const { connectDb } = require('../DB/connection')
const seedIfNeeded = require('./seedIfNeeded')

async function run() {
  await connectDb()
  await seedIfNeeded()
  console.log('Product seed sync complete.')
}

run()
  .then(async () => {
    await mongoose.disconnect()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await mongoose.disconnect()
    } catch {
      // ignore disconnect errors
    }
    process.exit(1)
  })
