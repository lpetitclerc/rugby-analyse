import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { sendGpsMatchToFrame } from '../src/lib/gps-frame.js'
import {
  inspectGpsCsv,
  mapGpsCsvContent,
  suggestGpsCsvMapping
} from '../src/lib/gps-csv.js'
import {
  appendGpsFiles,
  discoverGpsFiles,
  normalizeGpsBucket,
  normalizeGpsDay,
  normalizeGpsFiles
} from '../src/lib/gps-storage.js'
import {
  createGpsVideoReference,
  createGpsVideoUrl,
  discoverGpsVideos,
  gpsVideoDirectory
} from '../src/lib/gps-video-storage.js'

test('normalizes season buckets and match days consistently', () => {
  assert.equal(normalizeGpsBucket('2025-2026'), 'saison_2025_2026')
  assert.equal(normalizeGpsBucket(' saison_2025_2026 '), 'saison_2025_2026')
  assert.equal(normalizeGpsDay('15'), 'J15')
  assert.equal(normalizeGpsDay('j15'), 'j15')
  assert.equal(normalizeGpsDay(' J15 '), 'J15')
})

test('inspects CSV headers and suggests GPS field mappings', () => {
  const inspected = inspectGpsCsv(
    '\uFEFFPlayer Name,Time,Latitude,Longitude,Speed\n' +
    'Alice,12:00:01,48.1,-1.6,5.2\n'
  )

  assert.deepEqual(inspected.headers, [
    'Player Name', 'Time', 'Latitude', 'Longitude', 'Speed'
  ])
  assert.deepEqual(suggestGpsCsvMapping(inspected.headers), {
    joueuse: 0,
    temps: 1,
    latitude: 2,
    longitude: 3,
    vitesse: 4,
    frequenceCardiaque: -1
  })
})

test('maps selected CSV columns into the GPS worker format', () => {
  const mapped = mapGpsCsvContent(
    'Latitude;Player;Longitude;Time;FC\n' +
    '48,123;Alice;1,456;12:00:01;160\n',
    {
      joueuse: 1,
      temps: 3,
      latitude: 0,
      longitude: 2,
      vitesse: -1,
      frequenceCardiaque: 4
    }
  )

  assert.equal(mapped,
    "nom d'affichage du joueur;temps;lat;lon;speed (m/s);rythme cardiaque\n" +
    'Alice;12:00:01;48,123;1,456;;160'
  )
})

test('preserves quoted CSV values and commas inside selected fields', () => {
  const mapped = mapGpsCsvContent(
    'Athlete,Time,Lat,Lon\n' +
    '"Léa, A",12:00:01,"48,123","1,456"',
    {
      joueuse: 0,
      temps: 1,
      latitude: 2,
      longitude: 3,
      vitesse: -1,
      frequenceCardiaque: -1
    }
  )

  assert.equal(mapped,
    "nom d'affichage du joueur;temps;lat;lon;speed (m/s);rythme cardiaque\n" +
    'Léa, A;12:00:01;48,123;1,456;;'
  )
})

test('rejects incomplete or duplicated required CSV mappings', () => {
  const csv = 'name,time,lat,lon\nAlice,12:00:00,48,1'
  assert.throws(
    () => mapGpsCsvContent(csv, { joueuse: 0, temps: 1, latitude: -1, longitude: 3 }),
    /Associez une colonne/
  )
  assert.throws(
    () => mapGpsCsvContent(csv, { joueuse: 0, temps: 1, latitude: 2, longitude: 2 }),
    /différente/
  )
})

test('normalizes malformed manifests without dropping valid team entries', () => {
  assert.deepEqual(normalizeGpsFiles({
    domicile: [{ path: 'J1/home.csv' }, null, 'invalid'],
    exterieur: 'invalid'
  }), {
    domicile: [{ path: 'J1/home.csv' }],
    exterieur: []
  })
})

test('discovers CSVs for both teams and merges by path while preserving manifest metadata', async () => {
  const requests = []
  const storage = {
    from(bucket) {
      return {
        async list(directory, options) {
          requests.push({ bucket, directory, options })
          if (directory.endsWith('/domicile')) {
            return {
              data: [
                { name: '12345678-1234-1234-1234-123456789012_home.csv', id: 'stored-id', metadata: { size: 12 } },
                { name: 'notes.txt' }
              ],
              error: null
            }
          }
          return {
            data: [{ name: 'away.CSV', created_at: '2026-10-22' }],
            error: null
          }
        }
      }
    }
  }

  const result = await discoverGpsFiles(storage, {
    bucket: 'saison_2025_2026',
    journee: 'J15',
    matchId: 'match-uuid',
    manifest: {
      domicile: [{
        path: 'J15/gps/match-uuid/domicile/12345678-1234-1234-1234-123456789012_home.csv',
        nom: 'home-original.csv',
        id: 'manifest-id'
      }]
    }
  })

  assert.equal(requests.length, 2)
  assert.ok(requests.every(({ bucket, options }) =>
    bucket === 'saison_2025_2026' && options.limit === 1000
  ))
  assert.ok(requests.every(({ options }) => options.offset === 0))
  assert.equal(result.domicile.length, 1)
  assert.equal(result.domicile[0].nom, 'home-original.csv')
  assert.equal(result.domicile[0].id, 'manifest-id')
  assert.equal(result.domicile[0].taille, 12)
  assert.equal(result.domicile[0].bucket, 'saison_2025_2026')
  assert.equal(result.exterieur.length, 1)
  assert.equal(result.exterieur[0].nom, 'away.CSV')
  assert.equal(result.exterieur[0].equipe, undefined)
})

test('loads every Storage page when a team has more than 1000 objects', async () => {
  const offsets = []
  const storage = {
    from() {
      return {
        async list(directory, { offset }) {
          offsets.push(`${directory}:${offset}`)
          if (directory.endsWith('/domicile')) {
            return {
              data: offset === 0
                ? Array.from({ length: 1000 }, (_, index) => ({ name: `home-${index}.csv` }))
                : [{ name: 'home-last.csv' }],
              error: null
            }
          }
          return { data: [], error: null }
        }
      }
    }
  }

  const result = await discoverGpsFiles(storage, {
    bucket: 'saison_2025_2026',
    journee: 'J15',
    matchId: 'match-uuid'
  })

  assert.equal(result.domicile.length, 1001)
  assert.ok(offsets.includes('J15/gps/match-uuid/domicile:1000'))
  assert.ok(offsets.includes('J15/gps/match-uuid/exterieur:0'))
})

test('reports storage listing failures instead of returning partial results', async () => {
  const storage = {
    from() {
      return {
        async list(directory) {
          return directory.endsWith('/exterieur')
            ? { data: null, error: new Error('storage unavailable') }
            : { data: [], error: null }
        }
      }
    }
  }

  await assert.rejects(
    discoverGpsFiles(storage, {
      bucket: 'saison_2025_2026',
      journee: 'J15',
      matchId: 'match-uuid'
    }),
    /storage unavailable/
  )
})

test('appends new references without overwriting existing manifest data or duplicate paths', () => {
  const original = {
    domicile: [{ path: 'existing.csv', nom: 'existing.csv', custom: true }],
    exterieur: [{ path: 'away.csv' }]
  }
  const updated = appendGpsFiles(original, 'domicile', [
    { path: 'new.csv', nom: 'new.csv' },
    { path: 'existing.csv', nom: 'duplicate.csv' }
  ])

  assert.deepEqual(updated.domicile, [
    { path: 'existing.csv', nom: 'existing.csv', custom: true },
    { path: 'new.csv', nom: 'new.csv' }
  ])
  assert.deepEqual(updated.exterieur, original.exterieur)
  assert.deepEqual(original.domicile, [{ path: 'existing.csv', nom: 'existing.csv', custom: true }])
  assert.throws(() => appendGpsFiles(original, 'inconnue', []), /Équipe GPS inconnue/)
})

test('discovers match videos from the season bucket and builds storage references', async () => {
  let request
  const videos = await discoverGpsVideos({
    from(bucket) {
      return {
        async list(directory, options) {
          request = { bucket, directory, options }
          return {
            data: [
              { name: 'match.mp4', id: 'video-id', metadata: { size: 120 } },
              { name: 'recording.webm' },
              { name: 'notes.txt' }
            ],
            error: null
          }
        }
      }
    }
  }, {
    bucket: 'saison_2025_2026',
    journee: 'J15',
    matchId: 'match-uuid'
  })

  assert.deepEqual(request, {
    bucket: 'saison_2025_2026',
    directory: 'J15/video/match-uuid',
    options: { limit: 1000, offset: 0 }
  })
  assert.equal(gpsVideoDirectory('J15', 'match-uuid'), 'J15/video/match-uuid')
  assert.deepEqual(videos.map(({ path }) => path), [
    'J15/video/match-uuid/match.mp4',
    'J15/video/match-uuid/recording.webm'
  ])
  assert.deepEqual(createGpsVideoReference(videos[0]), {
    type: 'storage',
    bucket: 'saison_2025_2026',
    path: 'J15/video/match-uuid/match.mp4',
    nom: 'match.mp4'
  })
})

test('creates temporary signed URLs for stored videos without requiring one for legacy URLs', async () => {
  let signedRequest
  const storage = {
    from(bucket) {
      return {
        async createSignedUrl(path, expiresIn) {
          signedRequest = { bucket, path, expiresIn }
          return { data: { signedUrl: 'https://storage.example/signed-video' }, error: null }
        }
      }
    }
  }

  assert.equal(await createGpsVideoUrl(storage, {
    type: 'storage',
    bucket: 'saison_2025_2026',
    path: 'J15/video/match-uuid/match.mp4'
  }), 'https://storage.example/signed-video')
  assert.deepEqual(signedRequest, {
    bucket: 'saison_2025_2026',
    path: 'J15/video/match-uuid/match.mp4',
    expiresIn: 3600
  })
  assert.equal(await createGpsVideoUrl(storage, {
    type: 'url',
    url: 'https://video.example/match.mp4'
  }), 'https://video.example/match.mp4')
})

test('sends downloaded match files and settings to the frame in protocol order', async () => {
  const messages = []
  let selectedBucket
  const target = {
    postMessage(message, origin) {
      messages.push({ message, origin })
    }
  }
  const requestId = await sendGpsMatchToFrame({
    storage: {
      from(bucket) {
        selectedBucket = bucket
        return {
          async download(path) {
            assert.equal(path, 'J15/gps/match/domicile/player.csv')
            return { data: new Blob(['csv data']), error: null }
          }
        }
      }
    },
    target,
    origin: 'https://app.example',
    matchId: 'match',
    bucket: 'saison_2025_2026',
    files: [{
      path: 'J15/gps/match/domicile/player.csv',
      equipe: 'domicile',
      nom: 'player.csv'
    }],
    settings: { terrain: {} },
    video: { url: 'https://video.example/match.mp4' },
    viewerMode: true
  })

  assert.equal(selectedBucket, 'saison_2025_2026')
  assert.deepEqual(messages.map(({ message }) => message.type), [
    'GPS_VIEWER_MODE',
    'GPS_SETTINGS_APPLY',
    'GPS_LOAD_MATCH'
  ])
  assert.ok(requestId)
  assert.equal(messages[2].message.requestId, requestId)
  assert.equal(messages[2].message.fichiers[0].file.name, 'player.csv')
  assert.equal(messages[2].message.fichiers[0].file.type, 'text/csv')
  assert.ok(messages.every(({ origin: targetOrigin }) => targetOrigin === 'https://app.example'))
})

test('does not send a stale match load after downloads finish', async () => {
  const messages = []
  const requestId = await sendGpsMatchToFrame({
    storage: {
      from() {
        return { async download() { return { data: new Blob(['csv']), error: null } } }
      }
    },
    target: { postMessage: (message) => messages.push(message) },
    origin: 'https://app.example',
    matchId: 'old-match',
    bucket: 'saison_2025_2026',
    files: [{ path: 'old.csv', equipe: 'domicile' }],
    settings: {},
    video: {},
    isCurrent: () => false
  })

  assert.equal(requestId, null)
  assert.deepEqual(messages, [])
})

test('clamps GPS/video seeks to valid time ranges and limits quick jumps', async () => {
  const script = await readFile(new URL('../public/gps/sync-math.js', import.meta.url), 'utf8')
  const math = runInNewContext(`${script}\nSyncMath`)
  const range = math.range(30_000, 20_000, 80_000, 90)

  assert.deepEqual({ min: range.min, max: range.max }, { min: 0, max: 50 })
  assert.equal(math.clamp(-5, range.min, range.max), 0)
  assert.equal(math.clamp(55, range.min, range.max), 50)
  assert.equal(math.shift(20, -10, range.min, range.max), 10)
  assert.equal(math.shift(45, 10, range.min, range.max), 50)
  assert.equal(math.shift(5, -10, 0, 100), 0)
  assert.equal(math.shift(95, 10, 0, 100), 100)
})
