const STORAGE_PAGE_SIZE = 1000
const VIDEO_EXTENSIONS = /\.(mp4|webm)$/i
const SIGNED_URL_LIFETIME = 60 * 60

export function gpsVideoDirectory(journee, matchId) {
  return `${journee}/video/${matchId}`
}

export async function discoverGpsVideos(storage, { bucket, journee, matchId }) {
  const directory = gpsVideoDirectory(journee, matchId)
  const videos = []

  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await storage
      .from(bucket)
      .list(directory, { limit: STORAGE_PAGE_SIZE, offset })
    if (error) throw error

    const page = data || []
    videos.push(...page
      .filter((file) => typeof file.name === 'string' && VIDEO_EXTENSIONS.test(file.name))
      .map((file) => ({
        id: file.id || file.name,
        nom: file.name,
        bucket,
        path: `${directory}/${file.name}`,
        taille: file.metadata?.size ?? 0,
        importe_le: file.created_at || null
      })))

    if (page.length < STORAGE_PAGE_SIZE) break
  }

  return videos
}

export function createGpsVideoReference(video) {
  return {
    type: 'storage',
    bucket: video.bucket,
    path: video.path,
    nom: video.nom
  }
}

export async function createGpsVideoUrl(storage, video, fallbackBucket) {
  if (video?.type !== 'storage' || !video.path) {
    return video?.url || ''
  }

  const bucket = video.bucket || fallbackBucket
  if (!bucket) throw new Error('Le bucket Supabase de la vidéo est manquant.')

  const { data, error } = await storage
    .from(bucket)
    .createSignedUrl(video.path, SIGNED_URL_LIFETIME)
  if (error) throw error
  if (!data?.signedUrl) throw new Error(`Impossible de créer une URL pour ${video.path}.`)

  return data.signedUrl
}
