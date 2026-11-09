import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  supabase
} from '../lib/supabase'

export default function VideoPlayer({
  possession,
  saison,
  journee,
  playerWindow,
  onClose
}) {

  const [videoUrl, setVideoUrl] =
    useState(null)

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState(null)

  const closeTimer = useRef(null)

  useEffect(() => {

    if (!possession) {
      return
    }

    let active = true

    async function chargerVideo() {
      setLoading(true)
      setError(null)
      setVideoUrl(null)

      const bucketName = saison
      const filePath = `${journee}/${possession.uuid_possession}.mp4`

      console.log('Bucket vidéo :', bucketName)
      console.log('Chemin vidéo :', filePath)

      const {
        data,
        error: queryError
      } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 60 * 60)

      if (!active) {
        return
      }

      if (queryError) {
        console.error('Erreur vidéo Supabase :', queryError)
        setError(`Vidéo introuvable : ${bucketName}/${filePath}`)
        setLoading(false)
        return
      }

      console.log('URL vidéo :', data.signedUrl)
      setVideoUrl(data.signedUrl)
      setLoading(false)
    }

    chargerVideo()
    return () => {
      active = false
    }
  }, [possession, saison, journee])

  useEffect(() => {
    if (!playerWindow) {
      return
    }

    const closeCheck = window.setInterval(() => {
      if (playerWindow.closed) {
        onClose()
      }
    }, 300)

    return () => window.clearInterval(closeCheck)
  }, [playerWindow, onClose])

  useEffect(() => {
    window.clearTimeout(closeTimer.current)

    return () => {
      closeTimer.current = window.setTimeout(() => {
        if (playerWindow && !playerWindow.closed) {
          playerWindow.close()
        }
      }, 0)
    }
  }, [playerWindow])

  function closeVideo() {
    if (playerWindow && !playerWindow.closed) {
      playerWindow.close()
    }
    onClose()
  }

  if (!possession || !playerWindow || playerWindow.closed) {
    return null
  }

  const player = (
    <div className="video-panel video-detached-panel">

      <div className="video-header">

        <div>

          <div className="video-title">
            {possession.uuid_possession}
          </div>

          <div className="video-subtitle">
            Possession #
            {possession.ordre_possession}
          </div>

        </div>

        <button
          className="close-button"
          onClick={closeVideo}
          type="button"
          aria-label="Fermer la vidéo"
        >
          ✕
        </button>

      </div>

      <div className="video-content">

        {loading && (
          <div className="video-message">
            Chargement de la vidéo...
          </div>
        )}

        {error && (
          <div className="video-error">
            {error}
          </div>
        )}

        {videoUrl && (
          <video
            className="video"
            src={videoUrl}
            controls
            autoPlay
            playsInline
          />
        )}

      </div>

      <div className="video-info">

        <div>
          <strong>Début</strong>

          <span>
            {
              possession
                .type_debut_possession
                || '-'
            }
          </span>
        </div>

        <div>
          <strong>Résultat</strong>

          <span>
            {
              possession
                .resultat_possession
                || '-'
            }
          </span>
        </div>

        <div>
          <strong>Gain / perte</strong>

          <span>
            {
              possession
                .gain_perte_terrain
                || '-'
            }
          </span>
        </div>

        <div>
          <strong>Fin</strong>

          <span>
            {
              possession
                .type_fin_possession
                || '-'
            }
          </span>
        </div>

      </div>

    </div>
  )

  return createPortal(player, playerWindow.document.body)
}