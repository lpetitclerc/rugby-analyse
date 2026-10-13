const media=document.getElementById('video'),el=id=>document.getElementById(id);
const owner=window.opener,origin=location.origin;let waiting=true,sourceId=0;
function send(data){if(owner&&!owner.closed)owner.postMessage({channel:'gps-video',sourceId,...data},origin);}
function format(t){const ms=Math.floor(t*1000),s=Math.floor(t);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');}
function state(){const duration=Number.isFinite(media.duration)?media.duration:0;
  el('clock').textContent=format(media.currentTime);el('timeline').max=duration;el('timeline').value=media.currentTime;el('play').textContent=media.paused?'▶ Lecture':'❚❚ Pause';
  const option=[...el('rate').options].find(x=>Number(x.value)===media.playbackRate);if(option)el('rate').value=option.value;
  send({type:'state',time:media.currentTime,duration,paused:media.paused,waiting:waiting||media.seeking,rate:media.playbackRate,ready:media.readyState>=1&&!media.error});
}
async function play(){try{await media.play();}catch{el('message').textContent='Cliquez sur Lecture dans cette fenêtre pour autoriser la vidéo.';send({type:'error',message:'Lecture vidéo bloquée : cliquez sur Lecture dans la fenêtre vidéo.'});state();}}
window.addEventListener('message',({source,origin:from,data})=>{
  if(source!==owner||from!==origin||data?.channel!=='gps-video')return;
  if(data.type==='source'){sourceId=data.sourceId;media.pause();waiting=true;media.src=data.url;media.load();el('message').textContent=data.label;return;}
  if(data.sourceId!==sourceId)return;
  if(data.type==='linked')el('connection').textContent=data.active?'Synchronisée aux GPS':'Timelines indépendantes';
  if(data.type==='command'){
    if(data.action==='pause')media.pause();
    if(data.action==='play')play();
    if(data.action==='seek'&&Number.isFinite(data.time)&&Number.isFinite(media.duration)){media.currentTime=Math.max(0,Math.min(media.duration,data.time));}
    if(data.action==='rate'){try{media.playbackRate=data.rate;}catch{send({type:'error',message:'Cette vitesse n’est pas acceptée par le lecteur vidéo.'});}}
    state();
  }
});
['loadedmetadata','durationchange','timeupdate','play','pause','ratechange','seeking','seeked','ended'].forEach(name=>media.addEventListener(name,()=>{if(name==='seeked')waiting=media.readyState<3;state();}));
media.addEventListener('waiting',()=>{waiting=true;state();});media.addEventListener('playing',()=>{waiting=false;state();});media.addEventListener('canplay',()=>{waiting=false;state();});
media.addEventListener('error',()=>{waiting=true;el('message').textContent='Vidéo inaccessible ou format non pris en charge. Utilisez un fichier local ou une URL directe MP4/WebM.';send({type:'error',message:el('message').textContent});state();});
el('play').onclick=()=>media.paused?play():media.pause();el('zero').onclick=()=>{media.pause();media.currentTime=0;};el('timeline').oninput=e=>media.currentTime=Number(e.target.value);el('rate').onchange=e=>{try{media.playbackRate=Number(e.target.value);}catch{el('message').textContent='Vitesse non prise en charge.';}};
setInterval(state,100);
setInterval(()=>{if(!owner||owner.closed){media.pause();el('connection').textContent='Fenêtre GPS déconnectée';}},1000);
if(owner)send({type:'ready'});else el('message').textContent='Ouvrez cette fenêtre avec le bouton Vidéo de l’application GPS.';
