import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendGpsMatchToFrame } from '../lib/gps-frame'
import {
  appendGpsFiles,
  discoverGpsFiles,
  normalizeGpsBucket,
  normalizeGpsDay,
  normalizeGpsFiles
} from '../lib/gps-storage'
import './GpsPage.css'

const EMPTY_FILES = {
  domicile: [],
  exterieur: []
}

export default function GpsPage({
  saison,
  journee,
  matchId,
  assetsBase = '/gps/'
}) {
  const frameRef = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [gpsVideo, setGpsVideo] = useState({})
  const settingsRef = useRef({})
  const gpsVideoRef = useRef({})
  const saveTimer = useRef(null)
  const activeMatchRef = useRef(matchId)
  activeMatchRef.current = matchId
  const [iframeReady, setIframeReady] = useState(false)
  const [loadedMatchId, setLoadedMatchId] = useState(null)
  const [iframeVersion, setIframeVersion] = useState(0)
  const loadRequestRef = useRef(null)
  const loadingSequence = useRef(0)

  const [gpsFiles, setGpsFiles] = useState(EMPTY_FILES)
  const [loading, setLoading] = useState(false)
  const [uploadingTeam, setUploadingTeam] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const gpsUrl = `${assetsBase.replace(/\/?$/, '/')}index.html`

  const bucket = normalizeGpsBucket(saison)
  const dossierJournee = normalizeGpsDay(journee)

  const canUpload = Boolean(saison && journee && matchId)

  useLayoutEffect(() => {
    const frame = frameRef.current

    return () => {
      try {
        frame?.contentWindow?.videoSync?.dispose()
      } catch {
        // Lecteur déjà fermé ou inaccessible
      }
    }
  }, [])

  useEffect(() => {
    setLoadedMatchId(null)
    clearTimeout(saveTimer.current)
    settingsRef.current = {}
    gpsVideoRef.current = {}
    setGpsVideo({})
    setVideoUrl('')
    let cancelled = false

    async function chargerFichiers() {
      setGpsFiles(EMPTY_FILES)
      setError('')
      setMessage('')

      if (!matchId) {
        setLoading(false)
        return
      }

      setLoading(true)

      let data, queryError
      try {
        const result = await supabase
          .from('match')
          .select('gps_fichiers, gps_parametres, gps_video')
          .eq('uuid_match', matchId)
          .single()
        data = result.data
        queryError = result.error
      } catch (err) {
        queryError = err
      }

      if (cancelled) return

      if (queryError) {
        setError(queryError.message)
      } else {
        const params = data.gps_parametres || {}
        settingsRef.current = params
        gpsVideoRef.current = data.gps_video || {}
        setGpsVideo(gpsVideoRef.current)
        setVideoUrl(data.gps_video?.url || '')
        let fichiers = normalizeGpsFiles(data.gps_fichiers)

        try {
          const fusion = await discoverGpsFiles(supabase.storage, {
            bucket,
            journee: dossierJournee,
            matchId,
            manifest: fichiers
          })
          if (cancelled) return
          if (JSON.stringify(fusion) !== JSON.stringify(fichiers)) {
            const { data: savedRows, error: saveError } = await supabase
              .from('match')
              .update({ gps_fichiers: fusion })
              .eq('uuid_match', matchId)
              .select('uuid_match, gps_fichiers')

            if (saveError) throw saveError

            if (savedRows?.length === 1) {
              fichiers = normalizeGpsFiles(savedRows[0].gps_fichiers)
            } else {
              console.error('Aucune ligne mise à jour', {
                matchId,
                savedRows,
                fusion
              })

              // Permettre malgré tout l'affichage des CSV retrouvés.
              fichiers = fusion

              setError(
                'Les CSV ont été retrouvés, mais leurs références ' +
                'n’ont pas pu être enregistrées dans la table match.'
              )
            }
          }
        } catch (err) {
          if (cancelled) return
          console.error('Récupération GPS :', err)
          setError(err.message)
          setLoading(false)
          return
        }

        if (cancelled) return

        setGpsFiles(fichiers)
        setLoadedMatchId(matchId)
      }

      setLoading(false)
    }

    chargerFichiers()

    return () => {
      cancelled = true
    }
  }, [matchId, bucket, dossierJournee])

  useEffect(() => {
  function handleGpsMessage(event) {
    if (event.origin !== window.location.origin) return
    if (event.source !== frameRef.current?.contentWindow) return

    const data = event.data

    // L'iframe vient de terminer son initialisation
    if (data?.type === 'GPS_READY') {
      console.log('GPS : iframe prête')
      setIframeReady(true)
      return
    }

    if (data?.matchId !== matchId) return

    if (data.type === 'GPS_VIDEO_CHANGED' && data.video?.url) {
      const url = data.video.url
      supabase.from('match').update({gps_video:{url,type:'url'}})
        .eq('uuid_match',matchId).select('gps_video').single()
        .then(({data:saved,error:saveError})=>{
          if (saveError) { setError(saveError.message); return }
          if (activeMatchRef.current !== matchId) return
          gpsVideoRef.current = saved.gps_video
          setGpsVideo(saved.gps_video)
          setVideoUrl(url)
        })
      return
    }

    if (data.type === 'GPS_SETTINGS_CHANGED' && data.settings && typeof data.settings === 'object') {
      enregistrerParametres(data.settings, matchId)
      return
    }

    if (data.type === 'GPS_MATCH_LOADED') {
      if (data.requestId !== loadRequestRef.current) return
      loadRequestRef.current = null
      setMessage(`${data.count} fichier(s) GPS chargé(s) dans le terrain (${data.total} reçu(s)).`)
      if (data.errors?.length) {
        setError(`Certains fichiers GPS n'ont pas pu être importés : ${data.errors.join(' ')}`)
      }
    }

    if (data.type === 'GPS_MATCH_ERROR') {
      if (data.requestId !== loadRequestRef.current) return
      loadRequestRef.current = null
      setError(data.message || 'Erreur de chargement GPS.')
    }
  }

  window.addEventListener('message', handleGpsMessage)

  return () => {
    window.removeEventListener('message', handleGpsMessage)
  }
}, [matchId])

  useEffect(() => {
  if (
    !iframeReady ||
    !matchId ||
    loadedMatchId !== matchId ||
    loading
  ) {
    return
  }
  
  const sequence = ++loadingSequence.current
  let cancelled = false

  async function chargerGps() {
    loadRequestRef.current = null
    try {
      const entrees = [
        ...gpsFiles.domicile.map((f) => ({
          ...f,
          equipe: 'domicile'
        })),
        ...gpsFiles.exterieur.map((f) => ({
          ...f,
          equipe: 'exterieur'
        }))
      ]

      setMessage(
        `Chargement de ${entrees.length} fichier(s) GPS...`
      )

      if (
        cancelled ||
        sequence !== loadingSequence.current
      ) {
        return
      }

      const requestId = await sendGpsMatchToFrame({
        storage: supabase.storage,
        target: frameRef.current?.contentWindow,
        origin: window.location.origin,
        matchId,
        bucket,
        files: entrees,
        settings: settingsRef.current,
        video: gpsVideoRef.current,
        isCurrent: () => !cancelled && sequence === loadingSequence.current
      })
      if (!requestId) return
      loadRequestRef.current = requestId

      console.log(
        'GPS envoyés à l’iframe :',
        matchId,
        entrees.length
      )

    } catch (err) {
      if (!cancelled && sequence === loadingSequence.current) {
        console.error('Chargement GPS :', err)
        setError(
          `Impossible de charger les CSV : ${err.message}`
        )
      }
    }
  }

  chargerGps()

  return () => {
    cancelled = true
    loadingSequence.current++
  }
}, [
  iframeReady,
  loadedMatchId,
  matchId,
  loading,
  gpsFiles,
  bucket,
  iframeVersion
]
)

  function enregistrerParametres(changes, id) {
    if (!id || activeMatchRef.current !== id) return
    const merged = { ...settingsRef.current, ...changes }
    settingsRef.current = merged
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (activeMatchRef.current !== id) return
      const { error: saveError } = await supabase.from('match')
        .update({ gps_parametres: merged })
        .eq('uuid_match', id)
        .select('uuid_match').single()
      if (saveError) setError('Sauvegarde paramètres GPS : ' + saveError.message)
    }, 700)
  }

  async function enregistrerVideo() {
    if (!matchId) return
    const url = videoUrl.trim()
    if (url) {
      try {
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw Error()
      } catch {
        setError('Le lien vidéo doit être une URL http(s) valide.')
        return
      }
    }
    const value = { ...gpsVideoRef.current, url, type: 'url' }
    const { data, error: saveError } = await supabase.from('match')
      .update({ gps_video: value }).eq('uuid_match', matchId)
      .select('gps_video').single()
    if (saveError) { setError(saveError.message); return }
    gpsVideoRef.current = data.gps_video || value
    setGpsVideo(gpsVideoRef.current)
    frameRef.current?.contentWindow?.postMessage(
      { type: 'GPS_VIDEO_APPLY', matchId, video: data.gps_video || value },
      window.location.origin
    )
    setMessage('Vidéo enregistrée pour ce match.')
  }

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  async function importerFichiers(equipe, fileList) {
    const fichiers = Array.from(fileList || [])

    if (!canUpload || fichiers.length === 0) return

    const fichiersInvalides = fichiers.filter(
      (file) => !file.name.toLowerCase().endsWith('.csv')
    )

    if (fichiersInvalides.length > 0) {
      setError('Seuls les fichiers CSV sont acceptés.')
      return
    }

    setUploadingTeam(equipe)
    setError('')
    setMessage('')
    const nouveauxFichiers = []
    let phaseImport = 'upload'

    try {
      for (const file of fichiers) {
        // Préfixe unique pour éviter d'écraser un autre import
        const id = crypto.randomUUID()

        const nomSecurise = file.name
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_')

        const path =
          `${dossierJournee}/gps/${matchId}/${equipe}/${id}_${nomSecurise}`
        
        console.log('Bucket GPS :', bucket)
        console.log('Chemin GPS :', path)
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            contentType: 'text/csv',
            upsert: false
          })

        if (uploadError) throw uploadError

        nouveauxFichiers.push({
          id,
          nom: file.name,
          path,
          bucket,
          taille: file.size,
          importe_le: new Date().toISOString()
        })
      }

      phaseImport = 'manifest'
      // Read the latest manifest after uploads so concurrent completed imports are included.
      const { data: matchData, error: readError } = await supabase
        .from('match')
        .select('gps_fichiers')
        .eq('uuid_match', matchId)
        .single()
      if (readError) {
        throw new Error(
          `CSV téléversés, mais lecture du manifeste impossible : ${readError.message}`
        )
      }
      const updatedManifest = appendGpsFiles(
        matchData.gps_fichiers,
        equipe,
        nouveauxFichiers
      )

      const { data: saved, error: updateError } = await supabase
        .from('match')
        .update({ gps_fichiers: updatedManifest })
        .eq('uuid_match', matchId)
        .select('gps_fichiers').single()
      if (updateError) {
        throw new Error(
          `CSV téléversés, mais mise à jour du manifeste impossible : ${updateError.message}. ` +
          'Le rechargement Admin pourra les retrouver dans Storage.'
        )
      }
      setGpsFiles(normalizeGpsFiles(saved.gps_fichiers))
      setIframeReady(false)
      setIframeVersion((version) => version + 1)
      setMessage(
        `${nouveauxFichiers.length} fichier(s) importé(s) pour l'équipe ${equipe}.`
      )

    } catch (err) {
      console.error('Erreur import GPS :', err)
      const details = err?.message || "Erreur lors de l'import GPS."
      setError(phaseImport === 'upload' && nouveauxFichiers.length
        ? `${details} ${nouveauxFichiers.length} fichier(s) ont déjà été téléversés et pourront être retrouvés au prochain chargement Admin.`
        : details)
    } finally {
      setUploadingTeam(null)
    }
  }

  return (
    <section className="gps-page">

      <div className="gps-page-header">
        <div>
          <h1>GPS et vidéo</h1>

          <p>
            {matchId
              ? `Saison ${saison || '—'} · Journée ${journee || '—'} · Match ${matchId}`
              : 'Sélectionnez un match pour importer les données GPS.'}
          </p>
        </div>

        <a
          href={gpsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ouvrir l'outil dans un onglet
        </a>
      </div>

      {error && (
        <div className="error">{error}</div>
      )}

      {message && (
        <div className="gps-success">{message}</div>
      )}

      <div className="gps-import-grid">

        {[
          { key: 'domicile', title: 'Équipe domicile' },
          { key: 'exterieur', title: 'Équipe extérieure' }
        ].map((team) => (

          <div className="gps-import-card" key={team.key}>

            <div className="gps-import-card-header">
              <h2>{team.title}</h2>
              <span>
                {gpsFiles[team.key].length} fichier(s)
              </span>
            </div>

            <label className="gps-upload-button">
              {uploadingTeam === team.key
                ? 'Import en cours...'
                : '＋ Importer les CSV des joueuses'}

              <input
                type="file"
                accept=".csv,text/csv"
                multiple
                disabled={
                  !canUpload ||
                  loading ||
                  uploadingTeam !== null
                }
                onChange={async (event) => {
                  const files = event.target.files
                  await importerFichiers(team.key, files)
                  event.target.value = ''
                }}
              />
            </label>

            {loading ? (
              <p>Chargement...</p>
            ) : (
              <div className="gps-files-list">

                {gpsFiles[team.key].length === 0 ? (
                  <p>Aucun fichier GPS importé.</p>
                ) : (
                  gpsFiles[team.key].map((file) => (
                    <div
                      className="gps-file-item"
                      key={file.id || file.path}
                    >
                      <span>📄 {file.nom}</span>
                      <small>
                        {Math.round((file.taille || 0) / 1024)} Ko
                      </small>
                    </div>
                  ))
                )}

              </div>
            )}

          </div>

        ))}

      </div>

      <div className="gps-tool-section">
        <h2>Visualisation GPS et synchronisation vidéo</h2>

        <div className="gps-video-config" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="url" value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="URL directe de la vidéo MP4 / WebM"
            style={{ flex: 1 }} />
          <button type="button" onClick={enregistrerVideo} disabled={!matchId}>
            Enregistrer la vidéo
          </button>
        </div>
        <iframe
          key={`${matchId || 'aucun'}-${iframeVersion}`}
          ref={frameRef}
          src={gpsUrl}
          title="Animation GPS et synchronisation vidéo du match"
          className="gps-page-frame"
          allow="fullscreen; autoplay"
          allowFullScreen
          onLoad={() => {
            setIframeReady(false)
            loadRequestRef.current = null

            frameRef.current?.contentWindow?.postMessage(
              { type: 'GPS_PING' },
              window.location.origin
            )
          }
        }
        />
      </div>

    </section>
  )
}
