require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { connectDb } = require('./DB/connection')
const apiRouter = require('./Routes/router')

const app = express()

app.use(cors())
app.use(express.json())
app.use('/api', apiRouter)

const PORT = Number(process.env.PORT) || 5000

app.get('/', (_req, res) => {
  res
    .status(200)
    .send(`<h1 style="color:red">Jewellary Server start and waiting for client Request!!!</h1>`)
})

connectDb()
  .then(() => require('./seed/seedIfNeeded')())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Jewellary Server start at port :${PORT}`)
    })
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
