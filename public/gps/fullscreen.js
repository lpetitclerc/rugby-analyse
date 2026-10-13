// La demande native part du clic. Les changements natifs (dont Échap)
// pilotent l'interface, et la sortie reste accessible dans le pied de page.
function nativeFullscreen(){return document.fullscreenElement||document.webkitFullscreenElement;}
function terrainView(active){document.body.classList.toggle('focus',active);$('focus').checked=active;$('full').textContent=active?'Quitter le plein écran':'Plein écran';}
async function leaveTerrain(){const exit=document.exitFullscreen||document.webkitExitFullscreen;try{if(nativeFullscreen()&&exit)await exit.call(document);}catch{}terrainView(false);$('message').style.display='';}
async function toggleFullscreen(){
  if(nativeFullscreen()||document.body.classList.contains('focus')){await leaveTerrain();return;}
  const request=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
  try{if(!request)throw Error('API indisponible');await request.call(document.documentElement);terrainView(true);}
  catch{terrainView(true);$('message').textContent='Vue terrain activée. Le navigateur bloque le plein écran natif dans cette fenêtre : ouvrez la page dans un onglet normal et utilisez F11 si nécessaire.';$('message').style.display='block';}
}
$('full').onclick=toggleFullscreen;
$('leave').onclick=leaveTerrain;
$('focus').onchange=e=>{if(!e.target.checked&&nativeFullscreen())leaveTerrain();else terrainView(e.target.checked);};
function syncFullscreen(){terrainView(Boolean(nativeFullscreen()));$('message').style.display='';}
document.addEventListener('fullscreenchange',syncFullscreen);
document.addEventListener('webkitfullscreenchange',syncFullscreen);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){terrainView(false);$('message').style.display='';}
  if(e.code==='Space'&&!['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();$('play').click();}
});
