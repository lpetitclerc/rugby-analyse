// Coordonnées modifiables sans réimport : le worker conserve les GPS bruts.
(() => {
  const KEY='gps-terrain-v4';
  const form=$('terrain-form'),message=$('terrain-status');
  function fill(config){for(const name of ['A','B','C','D']){$('lat-'+name).value=config.points[name][0];$('lon-'+name).value=config.points[name][1];}$('terrain-width').value=config.width??70;$('terrain-rotation').value=config.rotation;$('terrain-mirror').checked=config.mirror;$('terrain-flip-vertical').checked=Boolean(config.flipVertical);}
  function updateTag(){const c=getGeometryConfig();document.querySelector('.tag').textContent=`VUE TERRAIN · ROTATION ${c.rotation}°${c.mirror?' · MIROIR G/D':''}${c.flipVertical?' · MIROIR H/B':''}`;}
  setGeometry(DEFAULT_GEOMETRY);
  fill(getGeometryConfig());updateTag();
  function parse(value){const text=value.trim().replace(',','.');return text?Number(text):NaN;}
  form.onsubmit=e=>{
    e.preventDefault();if(busy)return;if(!worker){message.textContent='Le traitement GPS est indisponible. Rechargez via un serveur local.';return;}
    const points={};for(const name of ['A','B','C','D'])points[name]=[parse($('lat-'+name).value),parse($('lon-'+name).value)];
    let config;try{config=compileGeometry({points,width:parse($('terrain-width').value),rotation:Number($('terrain-rotation').value),mirror:$('terrain-mirror').checked,flipVertical:$('terrain-flip-vertical').checked}).config;}catch(error){message.textContent=error.message;return;}
    window.videoSync?.pause();playing=false;updatePlay();setBusy(true);message.textContent='Recalcul des positions en cours…';worker.postMessage({type:'geometry',config});
  };
  $('terrain-default').onclick=()=>{if(busy)return;fill(DEFAULT_GEOMETRY);form.requestSubmit();};
  window.terrainUI={
    busy(active){for(const control of form.elements)control.disabled=active;},
    progress(name){message.textContent='Recalcul : '+name;},
    error(text){message.textContent=text;},
    restore(config){
      if (!config) return;
      const valid=compileGeometry(config).config;
      setGeometry(valid);fill(valid);updateTag();
      if(worker) worker.postMessage({type:'init',config:valid});
    },
    applied(config,total,invalid){setGeometry(config);fill(config);updateTag();message.textContent=`Terrain appliqué · ${total.toLocaleString('fr-FR')} positions recalculées.${invalid?' '+invalid+' positions non projetables masquées.':''}`;
      window.gpsNotifySettings?.({terrain:config});
    }
  };
})();
