export const GPS_TEAMS = ['domicile', 'exterieur']
const STORAGE_PAGE_SIZE = 1000

export function normalizeGpsBucket(season) {
  const normalized = String(season || '').trim().replace(/-/g, '_')
  return normalized.startsWith('saison_') ? normalized : `saison_${normalized}`
}

export function normalizeGpsDay(day) {
  const value = String(day ?? '').trim()
  return /^J/i.test(value) ? value : `J${value}`
}

export function normalizeGpsFiles(value) {
  const data = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    GPS_TEAMS.map((team) => [
      team,
      Array.isArray(data[team])
        ? data[team].filter((file) => file && typeof file === 'object' && !Array.isArray(file))
        : []
    ])
  )
}

function displayName(name) {
  return name.replace(/^[0-9a-f]{8}-[0-9a-f-]{27,}_/i, '')
}

export async function discoverGpsFiles(storage, { bucket, journee, matchId, manifest }) {
  const normalizedManifest = normalizeGpsFiles(manifest)
  const discovered = Object.fromEntries(GPS_TEAMS.map((team) => [team, []]))

  await Promise.all(GPS_TEAMS.map(async (team) => {
    const directory = `${journee}/gps/${matchId}/${team}`
    const storedFiles = []
    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const { data, error } = await storage
        .from(bucket)
        .list(directory, { limit: STORAGE_PAGE_SIZE, offset })
      if (error) throw error
      const page = data || []
      storedFiles.push(...page)
      if (page.length < STORAGE_PAGE_SIZE) break
    }

    discovered[team] = storedFiles
      .filter((file) => typeof file.name === 'string' && file.name.toLowerCase().endsWith('.csv'))
      .map((file) => ({
        id: file.id || file.name,
        nom: displayName(file.name),
        bucket,
        path: `${directory}/${file.name}`,
        taille: file.metadata?.size ?? 0,
        importe_le: file.created_at || null
      }))
  }))

  return Object.fromEntries(GPS_TEAMS.map((team) => {
    const filesByPath = new Map()

    for (const file of normalizedManifest[team]) {
      if (typeof file.path === 'string' && file.path) {
        filesByPath.set(file.path, { ...file, bucket: file.bucket || bucket })
      }
    }

    for (const file of discovered[team]) {
      const existing = filesByPath.get(file.path)
      filesByPath.set(file.path, existing
        ? {
            ...file,
            ...existing,
            id: existing.id || file.id,
            nom: existing.nom || file.nom,
            bucket: existing.bucket || bucket,
            taille: existing.taille ?? file.taille,
            importe_le: existing.importe_le || file.importe_le
          }
        : file)
    }

    return [team, [...filesByPath.values()]]
  }))
}

export function appendGpsFiles(manifest, team, additions) {
  if (!GPS_TEAMS.includes(team)) {
    throw new Error(`Équipe GPS inconnue : ${team}`)
  }

  const normalized = normalizeGpsFiles(manifest)
  const paths = new Set(normalized[team].map((file) => file.path).filter(Boolean))
  const uniqueAdditions = additions.filter((file) => {
    if (!file.path || paths.has(file.path)) return false
    paths.add(file.path)
    return true
  })

  return {
    ...normalized,
    [team]: [...normalized[team], ...uniqueAdditions]
  }
}
