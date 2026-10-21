import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './GpsPage.css'

const EMPTY_FILES = {
  domicile: [],
  exterieur: []
}

function normaliserJournee(journee) {
  const valeur = String(journee ?? '').trim()
  return /^J/i.test(valeur) ? valeur : `J${valeur}`
}

function normaliserFichiers(value) {
  const data = value && typeof value === 'object' ? value : {}

  return {
    domicile: Array.isArray(data.domicile) ? data.domicile : [],
    exterieur: Array.isArray(data.exterieur) ? data.exterieur : []
  }
}

async function retrouverFichiersGps(bucket, journee, matchId) {
  const resultat = {
    domicile: [],
    exterieur: []
  }

  for (const equipe of ['domicile', 'exterieur']) {
    const dossier = `${journee}/gps/${matchId}/${equipe}`

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(dossier, { limit: 1000 })

    if (error) throw error

    resultat[equipe] = (data || [])
      .filter((f) => f.name.toLowerCase().endsWith('.csv'))
      .map((f) => ({
        id: f.id || f.name,
        nom: f.name.replace(
          /^[0-9a-f]{8}-[0-9a-f-]{27,}_/i,
          ''
        ),
        bucket,
        path: `${dossier}/${f.name}`,
        taille: f.metadata?.size || 0,
        importe_le: f.created_at || null
      }))
  }

  return resultat
}

export default function GpsPage({
  saison,
  journee,
  matchId,
  assetsBase = '/gps/'
}) {
  const frameRef = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [gpsSettings, setGpsSettings] = useState({})
  const [gpsVideo, setGpsVideo] = useState({})
  const settingsRef = useRef({})
  const saveTimer = useRef(null)
  const activeMatchRef = useRef(matchId)
  activeMatchRef.current = matchId
  const [iframeReady, setIframeReady] = useState(false)
  const [loadedMatchId, setLoadedMatchId] = useState(null)
  const [iframeVersion, setIframeVersion] = useState(0)
  const loadingSequence = useRef(0)

  const [gpsFiles, setGpsFiles] = useState(EMPTY_FILES)
  const [loading, setLoading] = useState(false)
  const [uploadingTeam, setUploadingTeam] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const gpsUrl = `${assetsBase.replace(/\/?$/, '/')}index.html`

  const saisonNormalisee = String(saison || '')
  .trim()
  .replace(/-/g, '_')

  const bucket = saisonNormalisee.startsWith('saison_')
  ? saisonNormalisee
  : `saison_${saisonNormalisee}`

  const dossierJournee = normaliserJournee(journee)

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
    setGpsSettings({})
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
        setGpsSettings(params)
        setGpsVideo(data.gps_video || {})
        setVideoUrl(data.gps_video?.url || '')
        let fichiers = normaliserFichiers(data.gps_fichiers)

        try {
          const trouves = await retrouverFichiersGps(bucket, dossierJournee, matchId)
          const fusion = { domicile: [], exterieur: [] }
          for (const equipe of ['domicile', 'exterieur']) {
            const parChemin = new Map()
            for (const f of [...fichiers[equipe], ...trouves[equipe]]) {
              if (f.path) parChemin.set(f.path, f)
            }
            fusion[equipe] = [...parChemin.values()]
          }
          if (cancelled) return
          if (JSON.stringify(fusion) !== JSON.stringify(fichiers)) {
            const { data: savedRows, error: saveError } = await supabase
              .from('match')
              .update({ gps_fichiers: fusion })
              .eq('uuid_match', matchId)
              .select('uuid_match, gps_fichiers')

            if (saveError) throw saveError

            if (savedRows?.length === 1) {
              fichiers = normaliserFichiers(savedRows[0].gps_fichiers)
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
      setMessage(
        `${data.count} fichier(s) GPS chargé(s) dans le terrain.`
      )
    }

    if (data.type === 'GPS_MATCH_ERROR') {
      setError(data.message)
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

      const fichiers = await Promise.all(
        entrees.map(async (entree) => {
          const { data, error: downloadError } =
            await supabase.storage
              .from(entree.bucket || bucket)
              .download(entree.path)

          if (downloadError) throw downloadError

          return {
            equipe: entree.equipe,
            file: new File(
              [data],
              entree.nom,
              { type: 'text/csv' }
            )
          }
        })
      )

      if (
        cancelled ||
        sequence !== loadingSequence.current
      ) {
        return
      }

      frameRef.current?.contentWindow?.postMessage(
        { type: 'GPS_SETTINGS_APPLY', matchId, settings: gpsSettings, video: gpsVideo },
        window.location.origin
      )

      frameRef.current?.contentWindow?.postMessage(
        {
          type: 'GPS_LOAD_MATCH',
          matchId,
          fichiers
        },
        window.location.origin
      )

      console.log(
        'GPS envoyés à l’iframe :',
        matchId,
        fichiers.length
      )

    } catch (err) {
      if (!cancelled) {
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
  iframeVersion,
  gpsSettings,
  gpsVideo
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
    const value = { ...gpsVideo, url, type: 'url' }
    const { data, error: saveError } = await supabase.from('match')
      .update({ gps_video: value }).eq('uuid_match', matchId)
      .select('gps_video').single()
    if (saveError) { setError(saveError.message); return }
    setGpsVideo(data.gps_video || value)
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

    try {
      // Relecture de la version enregistrée en base
      const { data: matchData, error: readError } = await supabase
        .from('match')
        .select('gps_fichiers')
        .eq('uuid_match', matchId)
        .single()

      if (readError) throw readError

      const manifest = normaliserFichiers(matchData.gps_fichiers)
      const nouveauxFichiers = []

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

      const updatedManifest = {
        ...manifest,
        [equipe]: [
          ...manifest[equipe],
          ...nouveauxFichiers
        ]
      }

      const { data: saved, error: updateError } = await supabase
        .from('match')
        .update({ gps_fichiers: updatedManifest })
        .eq('uuid_match', matchId)
        .select('gps_fichiers').single()
      if (updateError) throw updateError
      setGpsFiles(normaliserFichiers(saved.gps_fichiers))
      setIframeReady(false)
      setIframeVersion((version) => version + 1)
      setMessage(
        `${nouveauxFichiers.length} fichier(s) importé(s) pour l'équipe ${equipe}.`
      )

    } catch (err) {
      console.error('Erreur import GPS :', err)
      setError(
        err?.message || "Erreur lors de l'import GPS."
      )
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
