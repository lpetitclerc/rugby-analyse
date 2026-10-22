import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendGpsMatchToFrame } from '../lib/gps-frame'
import {
  discoverGpsFiles,
  normalizeGpsBucket,
  normalizeGpsDay
} from '../lib/gps-storage'
import './GpsViewerPage.css'

export default function GpsViewerPage({ saison, journee, matchId, assetsBase = '/gps/' }) {
  const frameRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [record, setRecord] = useState(null)
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const loadRequestRef = useRef(null)
  const bucket = normalizeGpsBucket(saison)
  const normalizedDay = normalizeGpsDay(journee)

  useEffect(() => {
    let cancelled = false
    setRecord(null); setFiles([]); setReady(false); setError(''); setStatus('')
    if (!matchId || !saison || !journee) return
    async function load() {
      setLoading(true)
      try {
        const { data, error: err } = await supabase.from('match')
          .select('gps_fichiers,gps_parametres,gps_video').eq('uuid_match', matchId).single()
        if (err) throw err
        const discovered = await discoverGpsFiles(supabase.storage, {
          bucket,
          journee: normalizedDay,
          matchId,
          manifest: data.gps_fichiers
        })
        const combined = ['domicile', 'exterieur'].flatMap((team) =>
          discovered[team].map((file) => ({ ...file, equipe: team }))
        )
        if (!cancelled) { setRecord(data); setFiles(combined) }
      } catch (e) { if (!cancelled) setError(e.message || String(e)) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [matchId, saison, journee, bucket, normalizedDay])

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return
      const msg = event.data
      if (msg?.type === 'GPS_READY') setReady(true)
      if (msg?.matchId !== matchId) return
      if (msg.type === 'GPS_MATCH_LOADED') {
        if (msg.requestId !== loadRequestRef.current) return
        loadRequestRef.current = null
        setStatus(`${msg.count} fichier(s) GPS chargé(s) (${msg.total} reçu(s)).`)
        if (msg.errors?.length) {
          setError(`Certains fichiers GPS n'ont pas pu être importés : ${msg.errors.join(' ')}`)
        }
      }
      if (msg.type === 'GPS_MATCH_ERROR') {
        if (msg.requestId !== loadRequestRef.current) return
        loadRequestRef.current = null
        setError(msg.message || 'Erreur de chargement GPS')
      }
      // En mode visualisation, aucun message GPS_SETTINGS_CHANGED / GPS_VIDEO_CHANGED n'est enregistré.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [matchId])

  useEffect(() => {
    if (!ready || !record || !matchId) return
    let cancelled = false
    async function send() {
      loadRequestRef.current = null
      try {
        setLoading(true)
        const requestId = await sendGpsMatchToFrame({
          storage: supabase.storage,
          target: frameRef.current?.contentWindow,
          origin: window.location.origin,
          matchId,
          bucket,
          files,
          settings: record.gps_parametres || {},
          video: record.gps_video || {},
          viewerMode: true,
          isCurrent: () => !cancelled
        })
        if (!requestId) return
        loadRequestRef.current = requestId
        setStatus('Chargement des positions GPS…')
      } catch (e) { if (!cancelled) setError(e.message || String(e)) }
      finally { if (!cancelled) setLoading(false) }
    }
    send()
    return () => { cancelled = true }
  }, [ready, record, files, matchId, bucket])

  return <section className="gps-viewer">
    {!matchId && <p>Sélectionnez un match.</p>}
    {loading && <p role="status">Chargement des données GPS…</p>}
    {status && <p role="status">{status}</p>}
    {error && <p className="gps-viewer-error" role="alert">{error}</p>}
    {matchId && <iframe key={matchId} ref={frameRef} src={`${assetsBase.replace(/\/?$/, '/') }index.html?viewer=1`}
      title="Visualisation GPS" className="gps-viewer-frame"
      allow="fullscreen; autoplay" allowFullScreen onLoad={() => {
        setReady(false)
        loadRequestRef.current = null
        frameRef.current?.contentWindow?.postMessage({ type: 'GPS_PING' }, window.location.origin)
      }} />}
  </section>
}
