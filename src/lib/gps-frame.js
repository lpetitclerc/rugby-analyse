export async function sendGpsMatchToFrame({
  storage,
  target,
  origin,
  matchId,
  bucket,
  files,
  settings,
  video,
  viewerMode = false,
  isCurrent = () => true
}) {
  if (!target) throw new Error('La fenêtre du moteur GPS est indisponible.')

  const downloaded = await Promise.all(files.map(async (item) => {
    const { data, error } = await storage
      .from(item.bucket || bucket)
      .download(item.path)
    if (error) throw error

    const name = item.nom || item.path.split('/').pop()
    return {
      equipe: item.equipe,
      file: new File([data], name, { type: 'text/csv' })
    }
  }))

  if (!isCurrent()) return null

  if (viewerMode) {
    target.postMessage({ type: 'GPS_VIEWER_MODE', enabled: true }, origin)
  }
  target.postMessage({ type: 'GPS_SETTINGS_APPLY', matchId, settings, video }, origin)

  const requestId = crypto.randomUUID()
  target.postMessage({
    type: 'GPS_LOAD_MATCH',
    matchId,
    requestId,
    fichiers: downloaded
  }, origin)
  return requestId
}
