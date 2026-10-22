const DELIMITERS = [';', ',', '\t']
const REQUIRED_FIELDS = ['joueuse', 'temps', 'latitude', 'longitude']
const CANONICAL_HEADERS = [
  "nom d'affichage du joueur",
  'temps',
  'lat',
  'lon',
  'speed (m/s)',
  'rythme cardiaque'
]

function parseCsv(text, delimiter, maxRecords = Infinity) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++
      row.push(value)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      value = ''
      if (rows.length >= maxRecords) return rows
    } else {
      value += character
    }
  }

  if (value || row.length) {
    row.push(value)
    if (row.some((cell) => cell.trim())) rows.push(row)
  }
  if (quoted) throw new Error('Le fichier contient un champ CSV entre guillemets non terminé.')

  return rows
}

function delimiterFor(text) {
  const candidates = DELIMITERS.map((delimiter) => ({
    delimiter,
    columns: parseCsv(text, delimiter, 1)[0]?.length || 0
  }))
  return candidates.sort((a, b) => b.columns - a.columns)[0].delimiter
}

export function inspectGpsCsv(text) {
  const content = text.replace(/^\uFEFF/, '')
  const delimiter = delimiterFor(content)
  const rows = parseCsv(content, delimiter, 4)
  const headers = (rows.shift() || []).map((header) => header.trim())
  if (headers.length < 2) {
    throw new Error('Le fichier doit contenir une ligne d’en-têtes CSV.')
  }

  return {
    headers,
    delimiter,
    sampleRows: rows.slice(0, 3)
  }
}

function escapeField(value) {
  const normalized = String(value ?? '').replace(/[\r\n]+/g, ' ')
  return /[;"\n]/.test(normalized)
    ? `"${normalized.replace(/"/g, '""')}"`
    : normalized
}

export function mapGpsCsvContent(text, mapping) {
  const content = text.replace(/^\uFEFF/, '')
  const delimiter = delimiterFor(content)
  const rows = parseCsv(content, delimiter)
  const headers = (rows.shift() || []).map((header) => header.trim())
  const indexes = REQUIRED_FIELDS.map((field) => mapping[field])

  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= headers.length)) {
    throw new Error('Associez une colonne aux champs joueuse, temps, latitude et longitude.')
  }
  if (new Set(indexes).size !== indexes.length) {
    throw new Error('Chaque champ doit être associé à une colonne différente.')
  }

  const optionalIndexes = [
    Number.isInteger(mapping.vitesse) ? mapping.vitesse : -1,
    Number.isInteger(mapping.frequenceCardiaque) ? mapping.frequenceCardiaque : -1
  ]
  const output = [CANONICAL_HEADERS]

  for (const row of rows) {
    if (!row.some((cell) => cell.trim())) continue
    output.push([
      ...indexes.map((index) => row[index] || ''),
      ...optionalIndexes.map((index) => (index >= 0 ? row[index] || '' : ''))
    ])
  }

  return output.map((row) => row.map(escapeField).join(';')).join('\n')
}

export function suggestGpsCsvMapping(headers) {
  const normalized = headers.map((header) => header.trim().toLocaleLowerCase())
  const find = (aliases) => normalized.findIndex((header) =>
    aliases.some((alias) => header === alias || header.includes(alias))
  )

  return {
    joueuse: find(['nom d’affichage du joueur', "nom d'affichage du joueur", 'joueur', 'player', 'athlete', 'name']),
    temps: find(['temps', 'time', 'timestamp', 'heure']),
    latitude: find(['latitude', 'lat']),
    longitude: find(['longitude', 'lon', 'lng', 'long']),
    vitesse: find(['speed (m/s)', 'speed', 'vitesse']),
    frequenceCardiaque: find(['rythme cardiaque', 'heart rate', 'bpm', 'fc'])
  }
}
