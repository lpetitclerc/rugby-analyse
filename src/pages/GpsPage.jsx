import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendGpsMatchToFrame } from '../lib/gps-frame'
import {
  inspectGpsCsv,
  mapGpsCsvContent,
  suggestGpsCsvMapping
} from '../lib/gps-csv'
import {
  appendGpsFiles,
  discoverGpsFiles,
  normalizeGpsBucket,
  normalizeGpsDay,
  normalizeGpsFiles
} from '../lib/gps-storage'
import {
  createGpsVideoReference,
  createGpsVideoUrl,
  discoverGpsVideos,
  gpsVideoDirectory
} from '../lib/gps-video-storage'
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
  const [gpsVideo, setGpsVideo] = useState({})
  const settingsRef = useRef({})
  const gpsVideoRef = useRef({})
  const saveTimer = useRef(null)
  const activeMatchRef = useRef(matchId)
  activeMatchRef.current = matchId
  const [iframeReady, setIframeReady] = useState(false)
  const [loadedMatchId, setLoadedMatchId] = useState(null)
  const loadRequestRef = useRef(null)
  const loadingSequence = useRef(0)

  const [gpsFiles, setGpsFiles] = useState(EMPTY_FILES)
  const [loading, setLoading] = useState(false)
  const [uploadingTeam, setUploadingTeam] = useState(null)
  const [pendingCsv, setPendingCsv] = useState(null)
  const [csvError, setCsvError] = useState('')
  const [error, setError] = useState('')
  const [importWarnings, setImportWarnings] = useState([])
  const [message, setMessage] = useState('')
  const [videos, setVideos] = useState([])
  const [selectedVideoPath, setSelectedVideoPath] = useState('')
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [videoListingFailed, setVideoListingFailed] = useState(false)

  const gpsUrl = `${assetsBase.replace(/\/?$/, '/')}index.html?admin=1`

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
    setVideos([])
    setSelectedVideoPath('')
    setVideoError('')
    setVideoListingFailed(false)
    setPendingCsv(null)
    setCsvError('')
    let cancelled = false

    async function chargerFichiers() {
      setGpsFiles(EMPTY_FILES)
      setError('')
      setImportWarnings([])
      setMessage('')
      setVideoLoading(Boolean(matchId))

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
        setVideoLoading(false)
      } else {
        const params = data.gps_parametres || {}
        settingsRef.current = params
        gpsVideoRef.current = {}
        setGpsVideo({})
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
          setVideoLoading(false)
          return
        }

        if (cancelled) return

        try {
          const matchVideos = await discoverGpsVideos(supabase.storage, {
            bucket,
            journee: dossierJournee,
            matchId
          })
          if (cancelled) return

          setVideos(matchVideos)
          const selectedVideo = matchVideos.find(
            (video) => video.path === data.gps_video?.path
          )

          if (selectedVideo) {
            const reference = createGpsVideoReference(selectedVideo)
            const url = await createGpsVideoUrl(supabase.storage, reference, bucket)
            if (cancelled) return
            gpsVideoRef.current = { ...reference, url }
            setGpsVideo(gpsVideoRef.current)
            setSelectedVideoPath(selectedVideo.path)
          } else {
            gpsVideoRef.current = {}
            setGpsVideo({})
          }
        } catch (err) {
          if (cancelled) return
          console.error('Récupération des vidéos du match :', err)
          setVideoListingFailed(true)
          setVideoError(`Impossible de charger les vidéos du match : ${err.message}`)
        } finally {
          if (!cancelled) setVideoLoading(false)
        }

        if (cancelled) return
        setGpsFiles(fichiers)
        setLoadedMatchId(matchId)
      }

      setLoading(false)
      if (!matchId) setVideoLoading(false)
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

    if (data.type === 'GPS_SETTINGS_CHANGED' && data.settings && typeof data.settings === 'object') {
      enregistrerParametres(data.settings, matchId)
      return
    }

    if (data.type === 'GPS_MATCH_LOADED') {
      if (data.requestId !== loadRequestRef.current) return
      loadRequestRef.current = null
      setMessage(`${data.count} fichier(s) GPS chargé(s) dans le terrain (${data.total} reçu(s)).`)
      if (data.errors?.length) {
        setImportWarnings(data.errors)
      } else setImportWarnings([])
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
  bucket
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

  async function enregistrerVideo(video) {
    if (!matchId || !video) return
    setVideoLoading(true)
    setVideoError('')
    try {
      const reference = createGpsVideoReference(video)
      const url = await createGpsVideoUrl(supabase.storage, reference, bucket)
      const { data, error: saveError } = await supabase.from('match')
        .update({ gps_video: reference }).eq('uuid_match', matchId)
        .select('gps_video').single()
      if (saveError) throw saveError
      if (activeMatchRef.current !== matchId) return

      gpsVideoRef.current = { ...(data.gps_video || reference), url }
      setGpsVideo(gpsVideoRef.current)
      setSelectedVideoPath(video.path)
      frameRef.current?.contentWindow?.postMessage(
        { type: 'GPS_VIDEO_APPLY', matchId, video: gpsVideoRef.current },
        window.location.origin
      )
      setMessage('Vidéo du match sélectionnée.')
      return true
    } catch (err) {
      console.error('Sélection de la vidéo du match :', err)
      setVideoError(`Impossible d’enregistrer la vidéo : ${err.message}`)
      return false
    } finally {
      if (activeMatchRef.current === matchId) setVideoLoading(false)
    }
  }

  async function importerVideo(fileList) {
    const file = fileList?.[0]
    if (!canUpload || !file) return
    if (!/\.(mp4|webm)$/i.test(file.name)) {
      setVideoError('Seuls les fichiers vidéo MP4 et WebM sont acceptés.')
      return
    }

    setVideoUploading(true)
    setVideoError('')
    setMessage('')
    let uploadedPath = ''
    try {
      const safeName = file.name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
      const directory = gpsVideoDirectory(dossierJournee, matchId)
      uploadedPath = `${directory}/${crypto.randomUUID()}_${safeName}`
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(uploadedPath, file, {
          contentType: file.type || (file.name.toLowerCase().endsWith('.webm')
            ? 'video/webm'
            : 'video/mp4'),
          upsert: false
        })
      if (uploadError) throw uploadError

      const video = {
        id: uploadedPath,
        nom: file.name,
        bucket,
        path: uploadedPath,
        taille: file.size,
        importe_le: new Date().toISOString()
      }
      setVideos([video])
      if (!await enregistrerVideo(video)) {
        throw new Error('La référence vidéo n’a pas pu être enregistrée.')
      }
      if (activeMatchRef.current !== matchId) return
      setMessage('Vidéo téléversée et sélectionnée pour ce match.')
    } catch (err) {
      console.error('Téléversement vidéo :', err)
      setVideoError(uploadedPath
        ? `La vidéo a été téléversée, mais sa sélection a échoué : ${err.message}`
        : `Impossible de téléverser la vidéo : ${err.message}`)
    } finally {
      if (activeMatchRef.current === matchId) setVideoUploading(false)
    }
  }

  async function preparerImportCsv(team, fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setCsvError('')
    try {
      const { headers } = inspectGpsCsv(await files[0].text())
      for (const file of files.slice(1)) {
        const nextHeaders = inspectGpsCsv(await file.text()).headers
        if (JSON.stringify(nextHeaders) !== JSON.stringify(headers)) {
          throw new Error(
            'Les fichiers sélectionnés doivent avoir les mêmes colonnes dans le même ordre. ' +
            'Importez séparément ceux dont le format diffère.'
          )
        }
      }
      setPendingCsv({
        equipe: team,
        files,
        headers,
        mapping: suggestGpsCsvMapping(headers)
      })
    } catch (err) {
      setPendingCsv(null)
      setCsvError(`Impossible de lire les colonnes du CSV : ${err.message}`)
    }
  }

  async function importerFichierGps() {
    if (!pendingCsv || !canUpload) return

    const { equipe, files, mapping } = pendingCsv
    setUploadingTeam(equipe)
    setCsvError('')
    setError('')
    setMessage('')
    const newReferences = []

    try {
      for (const file of files) {
        const mappedContent = mapGpsCsvContent(await file.text(), mapping)
        const mappedFile = new File([mappedContent], file.name, {
          type: 'text/csv'
        })
        const id = crypto.randomUUID()
        const safeName = file.name
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${dossierJournee}/gps/${matchId}/${equipe}/${id}_${safeName}`
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, mappedFile, {
            contentType: 'text/csv',
            upsert: false
          })
        if (uploadError) throw uploadError

        newReferences.push({
          id,
          nom: file.name,
          path,
          bucket,
          taille: mappedFile.size,
          importe_le: new Date().toISOString()
        })
      }

      const { data: matchData, error: readError } = await supabase
        .from('match')
        .select('gps_fichiers')
        .eq('uuid_match', matchId)
        .single()
      if (readError) {
        throw new Error(`CSV téléversé, mais lecture du manifeste impossible : ${readError.message}`)
      }

      const updatedManifest = appendGpsFiles(
        matchData.gps_fichiers,
        equipe,
        newReferences
      )
      const { data: saved, error: updateError } = await supabase
        .from('match')
        .update({ gps_fichiers: updatedManifest })
        .eq('uuid_match', matchId)
        .select('gps_fichiers')
        .single()
      if (updateError) {
        throw new Error(
          `CSV téléversé, mais mise à jour du manifeste impossible : ${updateError.message}. ` +
          'Le rechargement Admin pourra le retrouver dans Storage.'
        )
      }

      setGpsFiles(normalizeGpsFiles(saved.gps_fichiers))
      setPendingCsv(null)
      setMessage(`${newReferences.length} fichier(s) GPS importé(s) pour l'équipe ${equipe}.`)
    } catch (err) {
      console.error('Erreur import GPS :', err)
      setCsvError(newReferences.length
        ? `${newReferences.length} fichier(s) ont été téléversé(s), mais leur enregistrement a échoué : ${err.message}. Le rechargement Admin pourra les retrouver dans Storage.`
        : err.message || "Erreur lors de l'import GPS.")
    } finally {
      setUploadingTeam(null)
    }
  }

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return (
    <section className="gps-page">

      <div className="gps-page-header">
        <div>
          <h1>GPS et vidéo</h1>

          <p>
            {matchId
              ? `Saison ${saison || '—'} · Journée ${journee || '—'} · Match ${matchId}`
              : 'Sélectionnez un match pour consulter les données GPS.'}
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

      {importWarnings.length > 0 && (
        <section className="gps-import-warnings" role="alert">
          <p>
            {importWarnings.length} fichier(s) GPS ignoré(s). Les autres fichiers ont été chargés.
          </p>
          <details>
            <summary>Afficher les fichiers concernés</summary>
            <ul>
              {importWarnings.map((warning, index) => (
                <li key={`${index}-${warning}`}>{warning}</li>
              ))}
            </ul>
          </details>
        </section>
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
              <span>{gpsFiles[team.key].length} fichier(s)</span>
            </div>
            <label className="gps-upload-button">
              {uploadingTeam === team.key
                ? 'Import en cours…'
                : '＋ Importer un CSV GPS'}
              <input
                type="file"
                accept=".csv,text/csv"
                multiple
                disabled={!canUpload || loading || uploadingTeam !== null}
                onChange={async (event) => {
                  await preparerImportCsv(team.key, event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
            {loading ? (
              <p>Chargement…</p>
            ) : (
              <div className="gps-files-list">
                {gpsFiles[team.key].length === 0 ? (
                  <p>Aucun fichier GPS importé.</p>
                ) : (
                  gpsFiles[team.key].map((file) => (
                    <div className="gps-file-item" key={file.id || file.path}>
                      <span>📄 {file.nom}</span>
                      <small>{Math.round((file.taille || 0) / 1024)} Ko</small>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {pendingCsv && (
        <section className="gps-csv-mapping" aria-labelledby="gps-csv-mapping-title">
          <h2 id="gps-csv-mapping-title">Associer les colonnes du fichier CSV</h2>
          <p>
            {pendingCsv.files.length} fichier(s) · {pendingCsv.files[0].name}
            {pendingCsv.files.length > 1 ? ` et ${pendingCsv.files.length - 1} autre(s)` : ''}
            {' · '}{pendingCsv.equipe === 'domicile' ? 'Équipe domicile' : 'Équipe extérieure'}
          </p>
          <p>Le temps doit être au format HH:MM:SS avec les millisecondes facultatives.</p>
          <div className="gps-csv-mapping-grid">
            {[
              { key: 'joueuse', label: 'Joueuse', required: true },
              { key: 'temps', label: 'Temps', required: true },
              { key: 'latitude', label: 'Latitude', required: true },
              { key: 'longitude', label: 'Longitude', required: true },
              { key: 'vitesse', label: 'Vitesse (optionnel)' },
              { key: 'frequenceCardiaque', label: 'Fréquence cardiaque (optionnel)' }
            ].map((field) => (
              <label key={field.key}>
                {field.label}
                <select
                  value={pendingCsv.mapping[field.key]}
                  onChange={(event) => setPendingCsv((current) => ({
                    ...current,
                    mapping: {
                      ...current.mapping,
                      [field.key]: event.target.value === ''
                        ? -1
                        : Number(event.target.value)
                    }
                  }))}
                >
                  <option value={-1}>
                    {field.required ? 'Choisir une colonne…' : 'Aucune'}
                  </option>
                  {pendingCsv.headers.map((header, index) => (
                    <option key={`${index}-${header}`} value={index}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {csvError && <p className="error" role="alert">{csvError}</p>}
          <div className="gps-csv-mapping-actions">
            <button
              type="button"
              onClick={() => {
                setPendingCsv(null)
                setCsvError('')
              }}
              disabled={uploadingTeam !== null}
            >
              Annuler
            </button>
            <button
              type="button"
              className="gps-csv-confirm"
              onClick={importerFichierGps}
              disabled={!canUpload || uploadingTeam !== null}
            >
              {uploadingTeam ? 'Import en cours…' : 'Importer le CSV'}
            </button>
          </div>
        </section>
      )}

      {!pendingCsv && csvError && (
        <div className="error" role="alert">{csvError}</div>
      )}

      <div className="gps-tool-section">
        <h2>Visualisation GPS et synchronisation vidéo</h2>

        <div className="gps-video-config">
          <label htmlFor="gps-match-video">Vidéo du match</label>
          {videoError && <p className="error" role="alert">{videoError}</p>}
          {videoLoading ? (
            <p role="status">Recherche des vidéos dans Supabase…</p>
          ) : videos.length > 0 ? (
            <select
              id="gps-match-video"
              value={selectedVideoPath}
              disabled={!matchId || videoLoading || videoUploading}
              onChange={(event) => {
                const video = videos.find((item) => item.path === event.target.value)
                if (video) enregistrerVideo(video)
              }}
            >
              <option value="">Choisir une vidéo du match…</option>
              {videos.map((video) => (
                <option key={video.path} value={video.path}>
                  {video.nom}
                </option>
              ))}
            </select>
          ) : videoListingFailed ? null : (
            <>
              <p>Aucune vidéo n’est disponible pour ce match.</p>
              <label className="gps-upload-button gps-video-upload">
                {videoUploading ? 'Téléversement en cours…' : '＋ Importer une vidéo MP4 ou WebM'}
                <input
                  type="file"
                  accept="video/mp4,video/webm,.mp4,.webm"
                  disabled={!canUpload || videoUploading || videoLoading}
                  onChange={async (event) => {
                    await importerVideo(event.target.files)
                    event.target.value = ''
                  }}
                />
              </label>
            </>
          )}
          {gpsVideo.url && (
            <p className="gps-video-selected">Vidéo sélectionnée : {gpsVideo.nom}</p>
          )}
        </div>
        <iframe
          key={matchId || 'aucun'}
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
