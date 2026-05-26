const Order = require('../../Models/Order')

const BLOCKED_STATUSES = ['Cancelled', 'cancelled']

function orderContainsProduct(order, productId) {
  const pid = String(productId)
  const items = Array.isArray(order.items) ? order.items : []
  return items.some((item) => item && String(item.productId) === pid)
}

/**
 * True if customer has a non-cancelled order containing this product.
 */
async function customerPurchasedProduct(customerId, customerEmail, productId) {
  if (!customerId || !productId) return false
  const pid = String(productId)
  const email = String(customerEmail || '')
    .trim()
    .toLowerCase()
  const query = {
    status: { $nin: BLOCKED_STATUSES },
    $or: [{ customerUserId: String(customerId) }],
  }
  if (email) {
    query.$or.push({ customerEmail: email })
  }
  const orders = await Order.find(query).select('items').lean()
  return orders.some((order) => orderContainsProduct(order, pid))
}

module.exports = { customerPurchasedProduct, orderContainsProduct }
