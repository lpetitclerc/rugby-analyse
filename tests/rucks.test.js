import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculerGainTerrainStats,
  getGainTerrainCategory,
  getGainTerrainClass,
  getDurationCategory,
  getDurationClass
} from '../src/lib/rucks.js'

test('categorizes integer ruck durations individually and groups durations above six', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map(getDurationCategory),
    ['1', '2', '3', '4', '5', '6', '+6s']
  )
  assert.equal(getDurationClass(null), 'duration-unknown')
  assert.equal(getDurationClass(8), 'duration-over-6')
})

test('counts ruck territory gains using strict thresholds and ignores missing values', () => {
  assert.deepEqual(
    [2.01, 2, -2, -2.01].map(getGainTerrainCategory),
    ['gain', 'neutre', 'neutre', 'perte']
  )
  assert.equal(getGainTerrainClass(null), 'gain-terrain-unknown')

  assert.deepEqual(calculerGainTerrainStats([
    { gain_metres_ruck: 2.1 },
    { gain_metres_ruck: 2 },
    { gain_metres_ruck: -2 },
    { gain_metres_ruck: -2.1 },
    { gain_metres_ruck: null },
    { gain_metres_ruck: 'invalide' }
  ]), {
    gain: 1,
    neutre: 2,
    perte: 1
  })
})
