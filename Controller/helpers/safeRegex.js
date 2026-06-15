/** Escape user input for safe use inside MongoDB $regex patterns. */
function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = { escapeRegex }
