// Worker : 36 octets/mesure, dont 16 de GPS bruts pour recalibrer. Affichage : 20.
importScripts('geometry.js');
const tracks = new Map();
function parseLine(line) {
  const fields=[]; let value='', quoted=false;
  for(let i=0;i<line.length;i++) { const c=line[i];
    if(c==='"') { if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted; }
    else if(c===';'&&!quoted){fields.push(value);value='';} else value+=c;
  } fields.push(value); return fields;
}
function time(s) {
  const m=s.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if(!m||+m[1]>23||+m[2]>59||+m[3]>59)return NaN;
  return (+m[1]*3600+ +m[2]*60+ +m[3])*1000+ +(m[4]||'').padEnd(3,'0');
}
function number(s){return s?.trim()?Number(s.replace(',','.')):NaN;}
class Builder {
  constructor(){this.length=0;this.times=new Uint32Array(32768);this.values=new Float32Array(32768*4);this.raw=new Float64Array(32768*2);}
  add(t,u,v,speed,hr,lat,lon){if(this.length===this.times.length){const times=new Uint32Array(this.length*2),values=new Float32Array(this.length*8),raw=new Float64Array(this.length*4);times.set(this.times);values.set(this.values);raw.set(this.raw);this.times=times;this.values=values;this.raw=raw;} const i=this.length++;this.times[i]=t;this.values.set([u,v,speed,hr],i*4);this.raw.set([lat,lon],i*2);}
  finish(){return {times:this.times.slice(0,this.length),values:this.values.slice(0,this.length*4),raw:this.raw.slice(0,this.length*2)};}
}
function merge(old, fresh) {
  // Stable chronological order. The last imported measure wins at equal time.
  const n=(old?.times.length||0)+fresh.times.length,times=new Uint32Array(n),values=new Float32Array(n*4),raw=new Float64Array(n*2),offset=old?.times.length||0;
  if(old){times.set(old.times);values.set(old.values);raw.set(old.raw);}times.set(fresh.times,offset);values.set(fresh.values,offset*4);raw.set(fresh.raw,offset*2);
  const order=Uint32Array.from({length:n},(_,i)=>i);order.sort((a,b)=>times[a]-times[b]||a-b);
  let size=0;for(let i=0;i<n;i++)if(i===n-1||times[order[i]]!==times[order[i+1]])size++;
  const outT=new Uint32Array(size),outV=new Float32Array(size*4),outR=new Float64Array(size*2);let j=0;
  for(let i=0;i<n;i++){const k=order[i];if(i<n-1&&times[k]===times[order[i+1]])continue;outT[j]=times[k];outV.set(values.subarray(k*4,k*4+4),j*4);outR.set(raw.subarray(k*2,k*2+2),j++*2);}return {times:outT,values:outV,raw:outR};
}
async function readFile(file) {
  const batch=new Map();let headers=null,cols,valid=0,invalid=0;
  function line(raw){if(!raw.trim())return;const f=parseLine(raw.replace(/\r$/,''));
    if(!headers){headers=f.map(s=>s.replace(/^\uFEFF/,'').trim().toLowerCase());cols=["nom d'affichage du joueur",'temps','lat','lon','speed (m/s)','rythme cardiaque'].map(h=>headers.indexOf(h));if(cols.slice(0,4).some(i=>i<0))throw Error('Colonnes nom, Temps, Lat et Lon requises.');return;}
    const name=f[cols[0]]?.trim(),t=time(f[cols[1]]||''),lat=number(f[cols[2]]),lon=number(f[cols[3]]);
    if(!name||!Number.isFinite(t)||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){invalid++;return;}
    const [u,v]=project(lat,lon);if(!Number.isFinite(u)||!Number.isFinite(v)){invalid++;return;}
    if(!batch.has(name))batch.set(name,new Builder());batch.get(name).add(t,u,v,number(f[cols[4]]),number(f[cols[5]]),lat,lon);valid++;
  }
  const reader=file.stream().getReader(),decoder=new TextDecoder();let pending='';
  try{while(true){const {done,value}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});let begin=0,pos;while((pos=pending.indexOf('\n',begin))!==-1){line(pending.slice(begin,pos));begin=pos+1;}pending=pending.slice(begin);if(done)break;}if(pending)line(pending);}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(!valid)throw Error('Aucune mesure valide.');
  for(const[name,builder]of batch)tracks.set(name,merge(tracks.get(name),builder.finish()));return {valid,invalid};
}
self.onmessage=async ({data})=>{
  if(data.type==='clear'){tracks.clear();return;}
  if(data.type==='init'){setGeometry(data.config);return;}
  if(data.type==='geometry'){
    try{setGeometry(data.config);}catch(e){self.postMessage({type:'geometry-error',message:e.message});return;}
    let total=0,invalid=0;for(const [name,p] of tracks){self.postMessage({type:'geometry-progress',name});for(let i=0;i<p.times.length;i++){const [u,v]=project(p.raw[i*2],p.raw[i*2+1]);p.values[i*4]=u;p.values[i*4+1]=v;total++;if(!Number.isFinite(u)||!Number.isFinite(v))invalid++;}}
    sendTracks({type:'geometry-done',config:getGeometryConfig(),total,invalid});return;
  }
  let valid=0,invalid=0;const errors=[];
  for(let i=0;i<data.files.length;i++){const file=data.files[i];self.postMessage({type:'progress',index:i+1,total:data.files.length,name:file.name});try{const r=await readFile(file);valid+=r.valid;invalid+=r.invalid;}catch(e){errors.push(file.name+' : '+e.message);}}
  sendTracks({type:'done',valid,invalid,errors});
};
function sendTracks(extra){
  const players=[],transfer=[];for(const[name,p]of tracks){const times=p.times.slice(),values=p.values.slice();players.push({name,times,values});transfer.push(times.buffer,values.buffer);}
  self.postMessage({players,...extra},transfer);
};
