export function openVideoWindow(possession) {
  const popup = window.open(
    '',
    'rugby-video-player',
    'popup=yes,width=960,height=720,resizable=yes'
  )

  if (!popup) {
    return null
  }

  popup.document.title = possession
    ? `Vidéo — Possession #${possession.ordre_possession ?? ''}`
    : 'Lecteur vidéo'

  if (!popup.document.body.dataset.videoPlayerReady) {
    const base = popup.document.createElement('base')
    base.href = window.location.href
    popup.document.head.append(base)

    document.head
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((stylesheet) => {
        popup.document.head.append(stylesheet.cloneNode(true))
      })

    const detachedStyles = popup.document.createElement('style')
    detachedStyles.textContent = `
      .video-detached-body {
        display: block;
        margin: 0;
        min-height: 100vh;
      }
      .video-panel.video-detached-panel {
        position: relative;
        inset: auto;
        width: 100%;
        max-width: none;
        border-radius: 0;
        box-shadow: none;
      }
    `
    popup.document.head.append(detachedStyles)
    popup.document.body.className = 'video-detached-body'
    popup.document.body.dataset.videoPlayerReady = 'true'
  }

  popup.focus()
  return popup
}
