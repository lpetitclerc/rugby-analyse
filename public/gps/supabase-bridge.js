// Pont sécurisé entre la page React parente et l'outil GPS (même origine).
let currentMatchId = null;
let processing = false;
window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  const msg = event.data;
  if (msg?.type === 'GPS_PING') {
    window.parent.postMessage({type:'GPS_READY'}, window.location.origin);
    return;
  }
  if (msg?.type !== 'GPS_LOAD_MATCH' || !msg.matchId || !Array.isArray(msg.fichiers)) return;
  if (processing || window.gpsIsBusy?.()) return;
  processing = true;
  try {
    if (!window.gpsClear?.()) throw new Error('Import GPS déjà en cours');
    currentMatchId = msg.matchId;
    const files = msg.fichiers.filter(({file}) => file instanceof File).map(({file,equipe}) => ({file,equipe}));
    if (files.length) {
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {window.removeEventListener('gps-import-done', onDone);reject(new Error('Import GPS trop long'));}, 120000);
        function onDone(){clearTimeout(timer);resolve();}
        window.addEventListener('gps-import-done', onDone, {once:true});
      });
      if (!window.gpsImportFiles?.(files)) throw new Error('Moteur GPS indisponible');
      await done;
    }
    window.parent.postMessage({type:'GPS_MATCH_LOADED',matchId:currentMatchId,count:files.length}, window.location.origin);
  } catch(error) {
    window.parent.postMessage({type:'GPS_MATCH_ERROR',matchId:msg.matchId,message:error.message}, window.location.origin);
  } finally { processing = false; }
});
window.parent.postMessage({type:'GPS_READY'}, window.location.origin);
