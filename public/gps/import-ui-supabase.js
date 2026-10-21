// Un seul worker et un seul lot à la fois. Les File sont lus en flux.
let worker=null,busy=false;
function setBusy(value){busy=value;window.terrainUI?.busy(value);$('file').disabled=value||!worker;$('clear').disabled=value;document.querySelector('.import').style.opacity=value?'.5':'1';}
function importFiles(files){if(busy||!worker)return false;setBusy(true);window.videoSync?.reset();playing=false;updatePlay();worker.postMessage({type:'import',files:Array.from(files)});return true;}
window.gpsImportFiles = importFiles;
window.gpsClear = () => { if(busy)return false;worker?.postMessage({type:'clear'});roster.clear();bounds();menu();return true; };
window.gpsIsBusy = () => busy;
try {
  worker=new Worker('gps-worker.js');worker.postMessage({type:'init',config:getGeometryConfig()});
  worker.onmessage=({data})=>{
    if(data.type==='progress'){$('message').textContent=`Import ${data.index}/${data.total} : ${data.name}`;return;}
    if(data.type==='geometry-progress'){window.terrainUI?.progress(data.name);return;}
    if(data.type==='geometry-error'){setBusy(false);window.terrainUI?.error(data.message);return;}
    if(data.type!=='done'&&data.type!=='geometry-done')return;
    for(const item of data.players){const team=item.equipe||'domicile', key=team+':'+item.name;let p=roster.get(key);if(!p){p={name:item.name,equipe:team,id:uid(key),color:window.gpsViewerMode?(team==='domicile'?'#dc2626':'#2563eb'):(savedColor(uid(key))||colors[roster.size%15]),visible:true};roster.set(key,p);}p.times=item.times;p.values=item.values;}
    if(data.type==='geometry-done'){window.terrainUI?.applied(data.config,data.total,data.invalid);menu();statsAt=0;setBusy(false);return;}
    bounds();menu();statsAt=0;setBusy(false);window.dispatchEvent(new Event('gps-import-done'));
    let count=0,bytes=0;for(const p of roster.values()){count+=p.times.length;bytes+=p.times.byteLength+p.values.byteLength;}
    $('message').textContent=`${roster.size} joueuse(s) · ${count.toLocaleString('fr-FR')} positions · ${(bytes/1048576).toFixed(1)} Mo de tableaux pour l’affichage. ${data.invalid?data.invalid+' lignes ignorées. ':''}${data.errors.join(' ')} Les fichiers restent sur ce PC.`;
  };
  worker.onerror=()=>{setBusy(false);worker.terminate();worker=null;$('file').disabled=true;$('message').textContent='Import indisponible. Lancez cette application via Live Server ou http://localhost:8000, puis rechargez la page.';};
}catch(e){$('file').disabled=true;$('message').textContent='Ouvrez l’application via Live Server ou un serveur local pour activer l’import.';}
$('file').onchange=e=>{importFiles(e.target.files);e.target.value='';};
$('clear').onclick=()=>{if(!window.gpsClear())return;$('message').textContent='Importez les CSV du match, en une seule sélection si vous le souhaitez.';};
$('message').textContent='Importez les CSV du match sélectionné.';
