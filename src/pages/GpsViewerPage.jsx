import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './GpsViewerPage.css'

const normJournee = v => /^J/i.test(String(v || '')) ? String(v) : `J${v}`
const normFiles = v => ({ domicile: Array.isArray(v?.domicile) ? v.domicile : [], exterieur: Array.isArray(v?.exterieur) ? v.exterieur : [] })

export default function GpsViewerPage({ saison, journee, matchId, assetsBase = '/gps/' }) {
  const frameRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [record, setRecord] = useState(null)
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const bucket = useMemo(() => {
    const s = String(saison || '').trim().replace(/-/g, '_')
    return s.startsWith('saison_') ? s : `saison_${s}`
  }, [saison])

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
        const manifest = normFiles(data.gps_fichiers)
        const combined = []
        for (const team of ['domicile', 'exterieur']) {
          const directory = `${normJournee(journee)}/gps/${matchId}/${team}`
          const { data: found, error: listError } = await supabase.storage.from(bucket).list(directory, { limit: 1000 })
          if (listError) throw listError
          const map = new Map()
          for (const f of manifest[team]) if (f.path) map.set(f.path, { ...f, equipe: team })
          for (const f of found || []) {
            if (!f.name.toLowerCase().endsWith('.csv')) continue
            const path = `${directory}/${f.name}`
            if (!map.has(path)) map.set(path, { path, bucket, nom: f.name, equipe: team })
          }
          combined.push(...map.values())
        }
        if (!cancelled) { setRecord(data); setFiles(combined) }
      } catch (e) { if (!cancelled) setError(e.message || String(e)) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [matchId, saison, journee, bucket])

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return
      const msg = event.data
      if (msg?.type === 'GPS_READY') setReady(true)
      if (msg?.matchId !== matchId) return
      if (msg.type === 'GPS_MATCH_LOADED') setStatus(`${msg.count} fichier(s) GPS chargé(s).`)
      if (msg.type === 'GPS_MATCH_ERROR') setError(msg.message || 'Erreur de chargement GPS')
      // En mode visualisation, aucun message GPS_SETTINGS_CHANGED / GPS_VIDEO_CHANGED n'est enregistré.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [matchId])

  useEffect(() => {
    if (!ready || !record || !matchId) return
    let cancelled = false
    async function send() {
      try {
        setLoading(true)
        const downloaded = await Promise.all(files.map(async item => {
          const { data, error: err } = await supabase.storage.from(item.bucket || bucket).download(item.path)
          if (err) throw err
          return { equipe: item.equipe, file: new File([data], item.nom || item.path.split('/').pop(), { type: 'text/csv' }) }
        }))
        if (cancelled) return
        const target = frameRef.current?.contentWindow
        target?.postMessage({ type: 'GPS_VIEWER_MODE', enabled: true }, window.location.origin)
        target?.postMessage({ type: 'GPS_SETTINGS_APPLY', matchId, settings: record.gps_parametres || {}, video: record.gps_video || {} }, window.location.origin)
        target?.postMessage({ type: 'GPS_LOAD_MATCH', matchId, fichiers: downloaded }, window.location.origin)
        setStatus('Chargement des positions GPS…')
      } catch (e) { if (!cancelled) setError(e.message || String(e)) }
      finally { if (!cancelled) setLoading(false) }
    }
    send()
    return () => { cancelled = true }
  }, [ready, record, files, matchId, bucket])

  return <section className="gps-viewer">
    {!matchId && <p>Sélectionnez un match.</p>}
    {error && <p className="gps-viewer-error" role="alert">{error}</p>}
    {matchId && <iframe key={matchId} ref={frameRef} src={`${assetsBase.replace(/\/?$/, '/') }index.html?viewer=1`}
      title="Visualisation GPS" className="gps-viewer-frame"
      allow="fullscreen; autoplay" allowFullScreen onLoad={() => {
        setReady(false)
        frameRef.current?.contentWindow?.postMessage({ type: 'GPS_PING' }, window.location.origin)
      }} />}
  </section>
}
