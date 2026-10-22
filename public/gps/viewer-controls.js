/* Complément viewer uniquement : ne modifie pas l'administration. */
(() => {
  if (new URLSearchParams(location.search).get('viewer') !== '1') return;
  const init = () => {
    if (document.getElementById('viewer-toolbar')) return;
    document.documentElement.classList.add('gps-viewer-mode');
    const play = document.getElementById('play');
    const seek = document.getElementById('seek');
    const video = document.getElementById('open-video');
    const controls = document.querySelector('.controls');
    if (!controls || !seek || !play) return;
    document.getElementById('focus')?.closest('label')?.remove();

    const toolbar = document.createElement('span');
    toolbar.id = 'viewer-toolbar';
    toolbar.setAttribute('role','group');
    toolbar.setAttribute('aria-label','Commandes de lecture GPS');
    function button(label, title, fn) {
      const b=document.createElement('button');
      b.type='button'; b.textContent=label; b.title=title;
      b.addEventListener('click',fn); toolbar.appendChild(b);
      return b;
    }
    function jump(seconds) {
      const min=Number(seek.min)||0, max=Number(seek.max)||0;
      const next=SyncMath.shift(Number(seek.value),seconds*1000,min,max);
      seek.value=String(next);
      seek.dispatchEvent(new Event('input',{bubbles:true}));
      seek.dispatchEvent(new Event('change',{bubbles:true}));
    }
    button('−10 s','Reculer de 10 secondes',()=>jump(-10));
    button('+10 s','Avancer de 10 secondes',()=>jump(10));
    button('+60 s','Avance rapide de 60 secondes',()=>jump(60));
    controls.insertBefore(toolbar,document.getElementById('reset')?.nextSibling||controls.firstChild);

    // Le bouton Lecture existant devient aussi le bouton Pause lorsqu'il joue.
    play.title='Lecture / Pause';

    // Bouton vidéo toujours accessible, sans déplacer le lecteur vidéo existant.
    if (video) {
      const b=document.createElement('button');
      b.id='viewer-video-button'; b.type='button';
      b.textContent='🎬 Vidéo sur écran 2';
      b.title='Ouvrir la fenêtre vidéo séparée';
      b.addEventListener('click',()=>video.click());
      controls.appendChild(b);
    }

    controls.appendChild(document.getElementById('full'));
  };
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
