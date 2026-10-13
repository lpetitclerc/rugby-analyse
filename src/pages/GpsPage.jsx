import { useLayoutEffect, useRef } from 'react'
import './GpsPage.css'

// assetsBase doit pointer vers les fichiers servis depuis public/gps.
export default function GpsPage({
  saison,
  journee,
  matchId,
  assetsBase = '/gps/'
}) {
  const frameRef = useRef(null)
  const gpsUrl = `${assetsBase.replace(/\/?$/, '/')}index.html`

  useLayoutEffect(() => {
    const frame = frameRef.current
    return () => {
      // Fermer la vidéo avant de retirer l'iframe lors d'un changement de page/match.
      try {
        frame?.contentWindow?.videoSync?.dispose()
      } catch {
        // Le lecteur peut déjà être fermé ou inaccessible.
      }
    }
  }, [])

  return (
    <section className="gps-page">
      <div className="gps-page-header">
        <div>
          <h1>GPS et vidéo</h1>
          <p>
            {matchId
              ? `Saison ${saison || '—'} · Journée ${journee || '—'} · Match ${matchId}`
              : 'Sélectionnez un match ou importez les CSV pour commencer.'}
          </p>
        </div>
        <a href={gpsUrl} target="_blank" rel="noreferrer">
          Ouvrir l’outil dans un onglet
        </a>
      </div>
      <iframe
        ref={frameRef}
        src={gpsUrl}
        title="Animation GPS et synchronisation vidéo du match"
        className="gps-page-frame"
        allow="fullscreen; autoplay"
        allowFullScreen
      />
    </section>
  )
}
