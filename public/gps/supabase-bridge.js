// Pont sécurisé entre la page React parente et l'outil GPS (même origine).
let processing = false;

function respond(type, msg, details = {}) {
  window.parent.postMessage({
    type,
    matchId: msg.matchId,
    requestId: msg.requestId,
    ...details
  }, window.location.origin);
}

function waitForImport() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Import GPS trop long'));
    }, 120000);
    function onDone(event) {
      cleanup();
      resolve(event.detail || {});
    }
    function onError(event) {
      cleanup();
      reject(new Error(event.detail || 'Le moteur GPS a échoué pendant l’import.'));
    }
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('gps-import-done', onDone);
      window.removeEventListener('gps-import-error', onError);
    }
    window.addEventListener('gps-import-done', onDone, { once: true });
    window.addEventListener('gps-import-error', onError, { once: true });
  });
}

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  const msg = event.data;
  if (msg?.type === 'GPS_PING') {
    window.parent.postMessage({type:'GPS_READY'}, window.location.origin);
    return;
  }
  if (msg?.type !== 'GPS_LOAD_MATCH') return;
  if (!msg.matchId || typeof msg.requestId !== 'string' || !Array.isArray(msg.fichiers)) {
    respond('GPS_MATCH_ERROR', msg, { message: 'Requête de chargement GPS invalide.' });
    return;
  }
  if (processing || window.gpsIsBusy?.()) {
    respond('GPS_MATCH_ERROR', msg, { message: 'Un import GPS est déjà en cours.' });
    return;
  }
  processing = true;
  try {
    const files = msg.fichiers.map((entry) => {
      if (!(entry?.file instanceof File) || !['domicile', 'exterieur'].includes(entry.equipe)) {
        throw new Error('Un fichier ou une équipe du lot GPS est invalide.');
      }
      return { file: entry.file, equipe: entry.equipe };
    });
    if (!window.gpsClear?.()) throw new Error('Import GPS déjà en cours');
    let result = {};
    if (files.length) {
      if (!window.gpsImportFiles?.(files)) throw new Error('Moteur GPS indisponible');
      result = await waitForImport();
    }
    const errors = Array.isArray(result.errors) ? result.errors : [];
    respond('GPS_MATCH_LOADED', msg, {
      count: Math.max(0, files.length - errors.length),
      total: files.length,
      valid: result.valid || 0,
      invalid: result.invalid || 0,
      errors
    });
  } catch(error) {
    respond('GPS_MATCH_ERROR', msg, { message: error.message || String(error) });
  } finally { processing = false; }
});
window.parent.postMessage({type:'GPS_READY'}, window.location.origin);
