export function getDurationCategory(duration) {
  const seconds = Number(duration)

  if (!Number.isInteger(seconds) || seconds < 1) {
    return null
  }

  return seconds > 6 ? '+6s' : String(seconds)
}

export function getDurationClass(duration) {
  const category = getDurationCategory(duration)

  if (!category) {
    return 'duration-unknown'
  }

  return category === '+6s'
    ? 'duration-over-6'
    : `duration-${category}`
}

export function getGainTerrainCategory(value) {
  if (
    value === null
    || value === undefined
    || (typeof value === 'string' && value.trim() === '')
  ) {
    return null
  }

  const gain = Number(value)

  if (!Number.isFinite(gain)) {
    return null
  }

  if (gain > 2) {
    return 'gain'
  }

  if (gain < -2) {
    return 'perte'
  }

  return 'neutre'
}

export function getGainTerrainClass(value) {
  const category = getGainTerrainCategory(value)

  if (category === 'gain') {
    return 'gain-terrain-positive'
  }

  if (category === 'perte') {
    return 'gain-terrain-negative'
  }

  return category
    ? 'gain-terrain-neutral'
    : 'gain-terrain-unknown'
}

export function calculerGainTerrainStats(rucks) {
  return rucks.reduce((stats, ruck) => {
    const category = getGainTerrainCategory(ruck.gain_metres_ruck)

    if (!category) {
      return stats
    }

    stats[category] += 1

    return stats
  }, {
    gain: 0,
    neutre: 0,
    perte: 0
  })
}
