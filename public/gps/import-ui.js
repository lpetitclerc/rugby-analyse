// Import GPS : manuel et depuis React / Supabase
let worker = null;
let busy = false;

function setBusy(value) {
  busy = value;
  window.terrainUI?.busy(value);
  $('file').disabled = value || !worker;
  $('clear').disabled = value;
  document.querySelector('.import').style.opacity = value ? '.5' : '1';
}

function importFiles(files) {
  if (busy || !worker) return false;

  setBusy(true);
  window.videoSync?.reset();
  playing = false;
  updatePlay();

  worker.postMessage({
    type: 'import',
    files: Array.from(files)
  });

  return true;
}

// Fonctions accessibles depuis le pont Supabase
window.gpsImportFiles = importFiles;
window.gpsIsBusy = () => busy;

window.gpsClear = () => {
  if (busy) return false;

  worker?.postMessage({ type: 'clear' });
  roster.clear();
  bounds();
  menu();

  return true;
};

try {
  worker = new Worker('gps-worker.js');

  worker.postMessage({
    type: 'init',
    config: getGeometryConfig()
  });

  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      $('message').textContent =
        `Import ${data.index}/${data.total} : ${data.name}`;
      return;
    }

    if (data.type === 'geometry-progress') {
      window.terrainUI?.progress(data.name);
      return;
    }

    if (data.type === 'geometry-error') {
      setBusy(false);
      window.terrainUI?.error(data.message);
      return;
    }

    if (
      data.type !== 'done' &&
      data.type !== 'geometry-done'
    ) return;

    for (const item of data.players) {
  const key = item.key || `${item.equipe || 'inconnue'}::${item.name}`;

  let p = roster.get(key);

  if (!p) {
    p = {
      name: item.name,
      equipe: item.equipe || 'inconnue',
      id: uid(key),
      color:
        savedColor(uid(key)) ||
        colors[roster.size % 15],
      visible: true
    };

    roster.set(key, p);
  }

  p.times = item.times;
  p.values = item.values;
}

    if (data.type === 'geometry-done') {
      window.terrainUI?.applied(
        data.config,
        data.total,
        data.invalid
      );

      menu();
      statsAt = 0;
      setBusy(false);
      return;
    }

    bounds();
    menu();
    statsAt = 0;
    setBusy(false);

    // Informe le pont Supabase que l'import est terminé
    window.dispatchEvent(new CustomEvent('gps-import-done', { detail: data }));

    let count = 0;
    let bytes = 0;

    for (const p of roster.values()) {
      count += p.times.length;
      bytes += p.times.byteLength + p.values.byteLength;
    }

    $('message').textContent =
      `${roster.size} joueuse(s) · ` +
      `${count.toLocaleString('fr-FR')} positions · ` +
      `${(bytes / 1048576).toFixed(1)} Mo. ` +
      `${data.invalid ? data.invalid + ' lignes ignorées. ' : ''}` +
      `${data.errors.join(' ')}`;
  };

  worker.onerror = (event) => {
    setBusy(false);
    worker.terminate();
    worker = null;
    $('file').disabled = true;

    const message = event.message || 'Import indisponible. Vérifiez gps-worker.js.';
    $('message').textContent = message;
    window.dispatchEvent(new CustomEvent('gps-import-error', { detail: message }));
  };

} catch (error) {
  $('file').disabled = true;
  $('message').textContent =
    'Impossible de démarrer le moteur GPS.';
}

$('file').onchange = (event) => {
  importFiles(event.target.files);
  event.target.value = '';
};

$('clear').onclick = () => {
  if (!window.gpsClear()) return;

  $('message').textContent =
    'Importez les CSV du match.';
};

$('message').textContent =
  'Importez les CSV du match sélectionné.';