const mongoose = require('mongoose')

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id
}

module.exports = { isValidObjectId }
