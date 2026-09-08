import { useEffect, useState } from 'react'

import {
  supabase
} from '../lib/supabase'

const VIDEO_BUCKET =
  import.meta.env.VITE_SUPABASE_VIDEO_BUCKET

export default function VideoPlayer({
  possession,
  saison,
  journee,
  onClose
}) {

  const [videoUrl, setVideoUrl] =
    useState(null)

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState(null)

  useEffect(() => {

    if (!possession) {
      return
    }

    chargerVideo()

  }, [possession])

async function chargerVideo() {

  setLoading(true)
  setError(null)
  setVideoUrl(null)

  const uuid =
    possession.uuid_possession

  // La saison correspond directement
  // au nom du bucket Supabase.
  //
  // Exemple :
  // bucket = saison_2025_2026
  const bucketName = saison

  // Chemin à l'intérieur du bucket :
  // J15/UUID.mp4
  const filePath =
    `${journee}/${uuid}.mp4`

  console.log(
    'Bucket vidéo :',
    bucketName
  )

  console.log(
    'Chemin vidéo :',
    filePath
  )

  const {
    data,
    error
  } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(
      filePath,
      60 * 60
    )

  if (error) {

    console.error(
      'Erreur vidéo Supabase :',
      error
    )

    setError(
      `Vidéo introuvable : ${bucketName}/${filePath}`
    )

    setLoading(false)

    return
  }

  console.log(
    'URL vidéo :',
    data.signedUrl
  )

  setVideoUrl(
    data.signedUrl
  )

  setLoading(false)
}

  if (!possession) {
    return null
  }

  return (
    <div className="video-panel">

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
          onClick={onClose}
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
}