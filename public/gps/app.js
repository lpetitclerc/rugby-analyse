
const $=id=>document.getElementById(id),colors=['#d5ff78','#53d7ff','#ff708a','#ffc45c','#ac9aff','#ff9b57','#62e6bc','#ed9de4','#ffffff','#55a5ff','#e4d767','#c777ff','#ef5350','#1ed4d4','#b7bbc9'];
window.gpsViewerMode=new URLSearchParams(window.location.search).get('viewer')==='1';
if(window.gpsViewerMode)document.documentElement.classList.add('gps-viewer-mode');
let roster=new Map(),start=0,end=0,current=0,playing=false,last=0,rect,canvas=$('pitch'),ctx=canvas.getContext('2d');
function savedColor(id){try{return localStorage.getItem(id)}catch{return null}}
function uid(name){return 'joueuse-'+Array.from(new TextEncoder().encode(name)).map(v=>v.toString(16).padStart(2,'0')).join('')}
function bounds(){window.videoSync?.reset();const p=[...roster.values()];start=p.length?Math.min(...p.map(x=>x.times[0])):0;end=p.length?Math.max(...p.map(x=>x.times.at(-1))):0;current=start;$('seek').max=end-start;$('duration').textContent=((end-start)/60000).toFixed(1).replace('.',',')+' min';playing=false;updatePlay()}
function gpsViewerLayout(){
  if(!window.gpsViewerMode || document.getElementById('gps-viewer-columns'))return;
  const pitch=$('pitch'),players=$('players');
  if(!pitch||!players)return;
  const pitchHost=pitch.parentElement;
  const layout=document.createElement('div');layout.id='gps-viewer-columns';
  const left=document.createElement('aside');left.id='gps-viewer-home';left.className='gps-viewer-team';
  const middle=document.createElement('div');middle.className='gps-viewer-center';
  const right=document.createElement('aside');right.id='gps-viewer-away';right.className='gps-viewer-team';
  const homeTitle=document.createElement('h3');homeTitle.textContent='Domicile';left.append(homeTitle);
  const awayTitle=document.createElement('h3');awayTitle.textContent='Extérieur';right.append(awayTitle);
  pitchHost.parentNode.insertBefore(layout,pitchHost);
  middle.append(pitchHost);layout.append(left,middle,right);
  // Les anciennes commandes sont conservées hors de la grille ; seule la liste est déplacée.
  players.style.display='none';
}
function menu(){
  if(window.gpsViewerMode)gpsViewerLayout();
  $('players').replaceChildren();$('count').textContent=`(${roster.size})`;
  const home=$('gps-viewer-home'),away=$('gps-viewer-away');
  for(const panel of [home,away]) panel?.querySelectorAll('.player').forEach(el=>el.remove());
  const list=[...roster.values()].sort((a,b)=>(a.equipe==='domicile'?0:1)-(b.equipe==='domicile'?0:1));
  for(const p of list){
    const box=document.createElement('div');box.className='player';
    const label=document.createElement('label');label.className='player-title';
    const check=document.createElement('input');check.type='checkbox';check.checked=p.visible;
    check.onchange=()=>{p.visible=check.checked;window.gpsSaveDisplay?.()};
    const name=document.createElement('span');name.className='gps-player-name';name.textContent=p.name;
    label.append(check,name);
    const palette=document.createElement('div');palette.className='palette';
    if(window.gpsViewerMode){
      // Pastille ouvrant un menu de couleurs, sans code hexadecimal visible.
      const dropdown=document.createElement('details');dropdown.className='gps-color-dropdown';
      const trigger=document.createElement('summary');trigger.className='gps-color-trigger';
      trigger.title=`Modifier la couleur de ${p.name}`;
      trigger.setAttribute('aria-label',`Modifier la couleur de ${p.name}`);
      trigger.style.backgroundColor=p.color;
      const choices=document.createElement('div');choices.className='gps-color-choices';
      const available=[...new Set(['#dc2626','#2563eb',...colors,p.color])];
      for(const color of available){
        const choice=document.createElement('button');choice.type='button';
        choice.className='gps-color-choice';choice.style.backgroundColor=color;
        choice.title=`Choisir cette couleur pour ${p.name}`;
        choice.setAttribute('aria-label',choice.title);
        choice.setAttribute('aria-pressed',String(p.color===color));
        choice.onclick=()=>{
          p.color=color;trigger.style.backgroundColor=color;
          choices.querySelectorAll('button').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===choice)));
          dropdown.open=false;
          try{localStorage.setItem(p.id,color)}catch{}
          window.gpsSaveDisplay?.();
        };
        choices.append(choice);
      }
      dropdown.append(trigger,choices);palette.append(dropdown);
      label.append(palette);
    }else{
      for(const color of colors){const b=document.createElement('button');b.className='swatch';b.style.background=color;b.title=`Couleur ${color} pour ${p.name}`;b.setAttribute('aria-pressed',p.color===color);b.onclick=()=>{p.color=color;try{localStorage.setItem(p.id,color)}catch{}menu();window.gpsSaveDisplay?.()};palette.append(b)}
    }
    const stat=document.createElement('div');stat.className='stats';stat.id=p.id;p.stat=stat;
    if(window.gpsViewerMode)box.append(label,stat);else box.append(label,palette,stat);
    const target=window.gpsViewerMode?(p.equipe==='exterieur'?away:home):null;
    (target||$('players')).append(box);
  }
}
function sample(p,t){const a=p.times;if(!a.length||t<a[0]||t>a.at(-1))return null;let lo=0,hi=a.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid]<=t)lo=mid;else hi=mid-1;}const next=Math.min(lo+1,a.length-1),gap=a[next]-a[lo];if(gap>2000&&t>a[lo])return null;const f=gap?(t-a[lo])/gap:0,x=lo*4,y=next*4,v=p.values;if(!Number.isFinite(v[x])||!Number.isFinite(v[x+1])||!Number.isFinite(v[y])||!Number.isFinite(v[y+1]))return null;return {u:v[x]+(v[y]-v[x])*f,v:v[x+1]+(v[y+1]-v[x+1])*f,speed:v[x+2],hr:v[x+3],index:lo};}
function fmt(t){let ms=Math.floor(t%1000),s=Math.floor(t/1000);return[Math.floor(s/3600)%24,Math.floor(s/60)%60,s%60].map(v=>String(v).padStart(2,'0')).join(':')+'.'+String(ms).padStart(3,'0')}
let statsAt=0;function draw(){const now=performance.now(),updateStats=now-statsAt>200;if(updateStats)statsAt=now;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);let pw=Math.max(1,Math.min(w-40,(h-40)*fieldRatio)),ph=pw/fieldRatio;rect={x:(w-pw)/2,y:(h-ph)/2,w:pw,h:ph};const {x,y}=rect;ctx.fillStyle='#1c543d';ctx.fillRect(x,y,pw,ph);for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#ffffff04':'#00000006';ctx.fillRect(x+i*pw/10,y,pw/10,ph)}ctx.strokeStyle='#cee4d4aa';ctx.lineWidth=1.5;ctx.strokeRect(x,y,pw,ph);// Rugby : métrage longitudinal 100 m, largeur réglable.
for(const line of rugbyMarkings()){ctx.setLineDash(line.dashed?[6,6]:[]);ctx.beginPath();ctx.moveTo(x+line.a[0]*pw,y+line.a[1]*ph);ctx.lineTo(x+line.b[0]*pw,y+line.b[1]*ph);ctx.stroke();}ctx.setLineDash([]);
ctx.font='11px system-ui';ctx.fillStyle='#8ca89b';screenCorners().forEach(([name,u,v])=>ctx.fillText(name,x+u*pw+(u<.5?-16:6),y+v*ph+(v<.5?-12:20)));let outside=0;for(const p of roster.values()){const s=sample(p,current),stat=p.stat;if(stat&&updateStats)stat.textContent=s?`${Number.isFinite(s.speed)?s.speed.toFixed(1)+' m/s':'Vitesse —'} · ${Number.isFinite(s.hr)?s.hr+' bpm':'FC —'}${s.u<0||s.u>1||s.v<0||s.v>1?' · Hors terrain':''}`:'Sans mesure à cet instant';if(!s||!p.visible)continue;if(s.u<0||s.u>1||s.v<0||s.v>1)outside++;const px=x+s.u*pw,py=y+s.v*ph;if($('trails').checked){ctx.beginPath();let active=false;for(let i=Math.max(0,s.index-60);i<=s.index;i++){const t=p.times[i],offset=i*4;if(t<current-5000){active=false;continue}if(i>0&&t-p.times[i-1]>2000)active=false;if(!Number.isFinite(p.values[offset])||!Number.isFinite(p.values[offset+1])){active=false;continue;}const tx=x+p.values[offset]*pw,ty=y+p.values[offset+1]*ph;if(active)ctx.lineTo(tx,ty);else ctx.moveTo(tx,ty);active=true}ctx.lineTo(px,py);ctx.strokeStyle=p.color+'65';ctx.lineWidth=2;ctx.stroke()}ctx.beginPath();ctx.arc(px,py,window.gpsViewerMode?4:7,0,Math.PI*2);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=window.gpsViewerMode?3:12;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=p.equipe==='domicile'?'#dc2626':p.equipe==='exterieur'?'#2563eb':'#101b22';ctx.lineWidth=2;ctx.stroke();if($('names').checked){ctx.font='600 12px system-ui';const tw=ctx.measureText(p.name).width;ctx.fillStyle='#101b22db';ctx.fillRect(px-tw/2-7,py-31,tw+14,20);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(p.name,px,py-17);ctx.textAlign='left'}}$('clock').textContent=fmt(current);$('seek').value=current-start;}
function updatePlay(){$('play').textContent=playing?'❚❚ Pause':'▶ Lecture'}$('play').onclick=()=>{if(!roster.size)return;if(current>=end)current=start;playing=!playing;updatePlay()};$('reset').onclick=()=>{current=start;playing=false;updatePlay()};$('seek').oninput=e=>current=start+Number(e.target.value);function frame(now){window.videoSync?.tick(now);if(!window.videoSync?.linked&&playing&&last){current=Math.min(end,current+(now-last)*Number($('rate').value));if(current===end){playing=false;updatePlay()}}last=now;draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);

// Paramètres persistants par match : protocole iframe <-> React.
let gpsPersistedDisplay = {};
let gpsRestoring = false;
window.gpsNotifySettings = function(changes) {
  if (gpsRestoring || window.parent === window || !window.gpsActiveMatchId) return;
  window.parent.postMessage({type:'GPS_SETTINGS_CHANGED',
    matchId:window.gpsActiveMatchId,settings:changes},window.location.origin);
};
window.gpsRestoreDisplay = function() {
  const s=gpsPersistedDisplay;
  if (typeof s.names==='boolean') $('names').checked=s.names;
  if (typeof s.trails==='boolean') $('trails').checked=s.trails;
  if (s.rate!=null && [...$('rate').options].some(o=>o.value===String(s.rate))) $('rate').value=String(s.rate);
  for (const [key,p] of roster) {
    const choice=s.players?.[key];
    if (choice) {
      if (typeof choice.visible==='boolean') p.visible=choice.visible;
      if (typeof choice.color==='string' && /^#[0-9a-f]{6}$/i.test(choice.color)) p.color=choice.color;
    }
  }
  menu();
};
function gpsSaveDisplay() {
  const players={};
  for(const [key,p] of roster) players[key]={visible:p.visible,color:p.color};
  window.gpsNotifySettings({affichage:{
    names:$('names').checked,trails:$('trails').checked,
    rate:$('rate').value,players
  }});
}
window.gpsSaveDisplay=gpsSaveDisplay;
for(const id of ['names','trails','rate']) $(id)?.addEventListener('change',gpsSaveDisplay);
window.addEventListener('gps-import-done',()=>{
  window.gpsRestoreDisplay();
  if(window.gpsViewerMode){
    for(const p of roster.values()) if(!gpsPersistedDisplay.players?.[p.id]?.color && !savedColor(p.id)) p.color=p.equipe==='exterieur'?'#2563eb':'#dc2626';
    menu();
  }
});
window.addEventListener('message',event=>{
  if(event.origin!==window.location.origin||event.source!==window.parent)return;
  const msg=event.data;
  if(msg?.type==='GPS_SETTINGS_APPLY') {
    window.gpsActiveMatchId=msg.matchId;
    gpsRestoring=true;
    try {
      gpsPersistedDisplay=msg.settings?.affichage||{};
      window.terrainUI?.restore(msg.settings?.terrain||DEFAULT_GEOMETRY);
      window.videoSync?.restore(msg.settings?.synchronisation||{},msg.video||{});
      window.gpsRestoreDisplay();
    }catch(err){console.error('Restauration GPS :',err)}
    finally{gpsRestoring=false}
  }
  if(msg?.type==='GPS_VIDEO_APPLY' && msg.matchId===window.gpsActiveMatchId) {
    window.videoSync?.restore(null,msg.video||{});
  }
});

// Mode consultation : appliqué uniquement à l'iframe du viewer.
window.addEventListener('message', event => {
  if(event.origin!==window.location.origin || event.source!==window.parent || event.data?.type!=='GPS_VIEWER_MODE')return;
  window.gpsViewerMode=Boolean(event.data.enabled);
  document.documentElement.classList.toggle('gps-viewer-mode',window.gpsViewerMode);
  if(!window.gpsViewerMode)return;
  document.body.classList.add('gps-viewer-mode');gpsViewerLayout();
  const style=document.createElement('style');style.textContent=`
    .gps-viewer-mode .import, .gps-viewer-mode input[type=file], .gps-viewer-mode label[for=file],
    .gps-viewer-mode #terrain-form,
    .gps-viewer-mode #terrain-status, .gps-viewer-mode .terrain-settings,
    .gps-viewer-mode .terrain-controls, .gps-viewer-mode .camera-controls,
    .gps-viewer-mode .camera-view, .gps-viewer-mode .vue-camera { display:none!important; }
    .gps-team-heading { margin:16px 0 8px; font-size:15px; font-weight:700; border-bottom:1px solid #8885; padding-bottom:6px; }
  `;document.head.append(style);
  for(const el of document.querySelectorAll('h1,h2,h3,summary,button')) {
    if(/^(terrain|vue cam[eé]ra|cam[eé]ra)$/i.test(el.textContent.trim())) {
      const section=el.closest('details,section,.panel,.card');if(section && !section.contains($('pitch')))section.style.display='none';
    }
  }
  for(const p of roster.values()) if(!gpsPersistedDisplay.players?.[p.id]?.color && !savedColor(p.id)) p.color=p.equipe==='exterieur'?'#2563eb':'#dc2626';
  menu();
});

// Le mode viewer est détecté depuis l'URL de l'iframe dès le chargement.
if(window.gpsViewerMode){
  const viewerStyle=document.createElement('style');
  viewerStyle.textContent=`
    .gps-viewer-mode .import, .gps-viewer-mode input[type="file"],
    .gps-viewer-mode label[for="file"], .gps-viewer-mode #terrain-form,
    .gps-viewer-mode #terrain-status, .gps-viewer-mode .terrain-settings,
    .gps-viewer-mode .terrain-controls, .gps-viewer-mode .camera-controls,
    .gps-viewer-mode .camera-view, .gps-viewer-mode .vue-camera {display:none!important;}
  `;
  document.head.append(viewerStyle);
}

if(window.gpsViewerMode){
  const css=document.createElement('link');css.rel='stylesheet';css.href='viewer-layout.css';document.head.append(css);
}
