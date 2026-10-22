const viewerMode = new URLSearchParams(window.location.search).get('viewer') === '1'
const fullscreenButton = $('full')
const focusCheckbox = $('focus')
const statusMessage = $('message')
let fallbackFocus = false

function nativeFullscreen() {
  return document.fullscreenElement || document.webkitFullscreenElement
}

function updateFullscreenState() {
  const active = Boolean(nativeFullscreen())
  if (active) fallbackFocus = false
  document.documentElement.classList.toggle('viewer-is-fullscreen', viewerMode && active)
  document.body.classList.toggle('focus', !viewerMode && (active || fallbackFocus))
  focusCheckbox.checked = !viewerMode && (active || fallbackFocus)
  fullscreenButton.textContent = active
    ? (viewerMode ? '⤢ Quitter plein écran' : 'Quitter le plein écran')
    : (viewerMode ? '⛶ Plein écran' : 'Plein écran')
  fullscreenButton.setAttribute('aria-pressed', String(active))
  if (statusMessage) statusMessage.style.display = ''
  window.dispatchEvent(new Event('resize'))
}

async function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen
  if (nativeFullscreen() && exit) {
    try {
      await exit.call(document)
    } catch (error) {
      if (statusMessage) {
        statusMessage.textContent = `Impossible de quitter le plein écran : ${error.message || error}`
        statusMessage.style.display = 'block'
      }
    }
  }
  if (!nativeFullscreen()) {
    fallbackFocus = false
    updateFullscreenState()
  }
}

async function toggleFullscreen() {
  if (nativeFullscreen()) {
    await exitFullscreen()
    return
  }

  const request = document.documentElement.requestFullscreen ||
    document.documentElement.webkitRequestFullscreen
  if (!request) {
    if (!viewerMode) {
      fallbackFocus = true
      updateFullscreenState()
    }
    if (statusMessage) {
      statusMessage.textContent = viewerMode
        ? 'Le plein écran natif n’est pas disponible dans ce navigateur.'
        : 'Vue terrain activée. Le plein écran natif n’est pas disponible dans cette fenêtre.'
      statusMessage.style.display = 'block'
    }
    return
  }

  try {
    await request.call(document.documentElement)
  } catch (error) {
    if (!viewerMode) {
      fallbackFocus = true
      updateFullscreenState()
    }
    if (statusMessage) {
      statusMessage.textContent = viewerMode
        ? `Plein écran refusé par le navigateur : ${error.message || error}`
        : `Vue terrain activée, mais le plein écran a été refusé : ${error.message || error}`
      statusMessage.style.display = 'block'
    }
  } finally {
    updateFullscreenState()
  }
}

fullscreenButton.addEventListener('click', toggleFullscreen)
$('leave').addEventListener('click', exitFullscreen)
focusCheckbox.addEventListener('change', (event) => {
  if (viewerMode) return
  if (!event.target.checked && nativeFullscreen()) {
    exitFullscreen()
    return
  }
  fallbackFocus = event.target.checked
  document.body.classList.toggle('focus', fallbackFocus)
  if (fallbackFocus) $('message').style.display = 'none'
})

document.addEventListener('fullscreenchange', updateFullscreenState)
document.addEventListener('webkitfullscreenchange', updateFullscreenState)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && fallbackFocus && !nativeFullscreen()) {
    fallbackFocus = false
    updateFullscreenState()
  }
  if (event.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
    event.preventDefault()
    $('play').click()
  }
})

updateFullscreenState()
