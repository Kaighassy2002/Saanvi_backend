const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { escapeRegex } = require('../Controller/helpers/safeRegex')

describe('escapeRegex', () => {
  it('escapes regex metacharacters', () => {
    assert.equal(escapeRegex('a+b*c?'), 'a\\+b\\*c\\?')
    assert.equal(escapeRegex('(test)'), '\\(test\\)')
  })

  it('handles empty input', () => {
    assert.equal(escapeRegex(''), '')
    assert.equal(escapeRegex(null), '')
  })
})
