// La vidéo est l'horloge de référence après l'alignement.
// Un message de son lecteur transporte la position réelle toutes les 100 ms.
(() => {
  let popup=null,ready=false,source=null,sourceId=0,state=null,receivedAt=0,linked=false,anchor=0;
  const origin=location.origin;
  const status=text=>$('sync-status').textContent=text;
  const send=data=>{if(popup&&!popup.closed&&ready)popup.postMessage({channel:'gps-video',sourceId,...data},origin);};
  const command=(action,extra={})=>send({type:'command',action,...extra});
  function seconds(){if(!state)return 0;const elapsed=!state.paused&&!state.waiting?Math.min(250,Math.max(0,performance.now()-receivedAt))*state.rate/1000:0;return SyncMath.clamp(state.time+elapsed,0,state.duration);}
  function range(){return SyncMath.range(anchor,start,end,state?.duration||0);}
  function restoreRange(){$('seek').min=0;$('seek').max=end-start;}
  function unlink(message='Timelines indépendantes. Placez les deux curseurs, puis synchronisez.'){
    linked=false;playing=false;updatePlay();restoreRange();$('sync').textContent='Synchroniser ces instants';$('sync').disabled=!(state?.ready&&roster.size);$('match-time').textContent='GPS : heure du fichier';send({type:'linked',active:false});status(message);
  }
  function align(){
    if(linked){command('pause');unlink();window.gpsNotifySettings?.({synchronisation:{anchor,linked:false}});return;}
    if(!state?.ready||!roster.size){status('Chargez les GPS et une vidéo lisible avant de synchroniser.');return;}
    // Mise en pause sur les instants affichés : aucun décalage pendant le clic.
    const videoTime=seconds();anchor=SyncMath.anchor(current,videoTime);const r=range();
    if(r.max<=r.min){status('Les données GPS et la vidéo ne couvrent pas une plage commune.');return;}
    playing=false;state={...state,time:videoTime,paused:true};receivedAt=performance.now();command('pause');command('seek',{time:videoTime});
    linked=true;window.gpsNotifySettings?.({synchronisation:{anchor,linked:true}});updatePlay();$('seek').min=Math.ceil(SyncMath.gps(anchor,r.min)-start);$('seek').max=Math.floor(SyncMath.gps(anchor,r.max)-start);
    $('sync').textContent='Désynchroniser';send({type:'linked',active:true});
    status(`Synchronisé : vidéo 00:00:00 = GPS ${fmt(anchor)}. Les contrôles des deux fenêtres sont liés.`);
  }
  function openVideo(){
    if(popup&&!popup.closed){popup.focus();return true;}
    ready=false;state=null;$('sync').disabled=true;
    popup=window.open('video.html','gps-video-player','popup=yes,width=960,height=640');
    if(!popup){status('Autorisez les fenêtres supplémentaires pour ouvrir le lecteur vidéo.');return false;}
    status('Ouverture du lecteur vidéo…');return true;
  }
  $('open-video').onclick=openVideo;
  $('sync').onclick=align;
  window.addEventListener('message',event=>{
    if(event.source!==popup||event.origin!==origin||event.data?.channel!=='gps-video')return;const data=event.data;
    if(data.type==='ready'){ready=true;if(source)send({type:'source',...source});else status('Aucune vidéo configurée pour ce match.');return;}
    if(data.sourceId!==sourceId)return;
    if(data.type==='error'){command('pause');unlink(data.message);return;}
    if(data.type==='state'&&Number.isFinite(data.time)&&Number.isFinite(data.duration)&&Number.isFinite(data.rate)){
      state=data;receivedAt=performance.now();$('sync').disabled=!(data.ready&&roster.size);
      if(restoredSync?.linked && data.ready && roster.size && !linked){
        const r=range();if(r.max>r.min){linked=true;playing=false;updatePlay();$('sync').textContent='Désynchroniser';$('seek').min=Math.ceil(SyncMath.gps(anchor,r.min)-start);$('seek').max=Math.floor(SyncMath.gps(anchor,r.max)-start);send({type:'linked',active:true});status('Synchronisation du match restaurée.');}
      }
      if(linked){playing=!data.paused;updatePlay();const opt=[...$('rate').options].find(o=>Number(o.value)===data.rate);if(opt)$('rate').value=opt.value;}
    }
  });
  const gpsPlay=$('play').onclick,gpsReset=$('reset').onclick,gpsSeek=$('seek').oninput;
  $('play').onclick=()=>{if(!linked){gpsPlay();return;}const r=range();if(seconds()>=r.max-.02){command('seek',{time:r.min});state={...state,time:r.min,paused:true};receivedAt=performance.now();}command(state.paused?'play':'pause');};
  $('reset').onclick=()=>{if(!linked){gpsReset();return;}command('pause');command('seek',{time:range().min});};
  $('seek').oninput=e=>{if(!linked){gpsSeek(e);return;}const r=range(),t=SyncMath.clamp(SyncMath.video(anchor,start+Number(e.target.value)),r.min,r.max);current=SyncMath.gps(anchor,t);state={...state,time:t,waiting:true};receivedAt=performance.now();command('seek',{time:t});};
  $('rate').onchange=e=>{if(linked)command('rate',{rate:Number(e.target.value)});};
  let restoredSync=null;
  window.videoSync={
    restore(sync,video){
      if(sync) restoredSync=sync;
      const url=video?.url||'';
      if(url && (!source || source.url!==url)) {
        if(source){
          command('pause');
          unlink('Nouvelle vidéo. Attendez son chargement, puis alignez les curseurs.');
          restoredSync={...restoredSync,linked:false};
          window.gpsNotifySettings?.({synchronisation:{anchor,linked:false}});
        }
        state=null;$('sync').disabled=true;
        source={url,label:video.nom||url};sourceId++;
        if(ready) send({type:'source',...source});
      }
      if(restoredSync && Number.isFinite(restoredSync.anchor)) anchor=restoredSync.anchor;
      // L'alignement effectif nécessite une vidéo prête et des GPS chargés.
    },
    get linked(){return linked;},
    dispose(){command('pause');if(popup&&!popup.closed)popup.close();},
    reset(){if(linked)command('pause');unlink();},
    pause(){if(linked)command('pause');},
    tick(){if(!linked||!state)return;const r=range(),t=seconds(),bounded=SyncMath.clamp(t,r.min,r.max);
      current=SyncMath.gps(anchor,bounded);playing=!state.paused;updatePlay();
      $('match-time').textContent='Temps vidéo : '+formatRelative(bounded);
      if(t<r.min-.01||t>r.max+.01||(!state.paused&&t>=r.max)){
        command('pause');command('seek',{time:bounded});state={...state,time:bounded,paused:true};receivedAt=performance.now();playing=false;updatePlay();status('Limite de la plage GPS/vidéo commune atteinte.');
      }
    }
  };
  function formatRelative(seconds){const ms=Math.floor(Math.max(0,seconds)*1000),s=Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');}
  setInterval(()=>{if(popup?.closed){popup=null;ready=false;state=null;unlink('Fenêtre vidéo fermée. Les GPS sont indépendants.');}},500);
  window.addEventListener('beforeunload',()=>command('pause'));
})();
