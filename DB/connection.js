const mongoose = require('mongoose')

async function connectDb() {
  const uri = (process.env.CONNECTION_STRING || '').trim()
  if (!uri) {
    throw new Error('CONNECTION_STRING is missing in .env')
  }
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  })
  console.log('Mongodb Atlas connected with Jewellery Server')
}

module.exports = { connectDb }
