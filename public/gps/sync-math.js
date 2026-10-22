// Horloge GPS en millisecondes, horloge vidéo en secondes.
const SyncMath = {
  anchor(gpsMs,videoSeconds){return gpsMs-videoSeconds*1000;},
  gps(anchor,videoSeconds){return anchor+videoSeconds*1000;},
  video(anchor,gpsMs){return (gpsMs-anchor)/1000;},
  range(anchor,gpsStart,gpsEnd,duration){return {min:Math.max(0,(gpsStart-anchor)/1000),max:Math.min(duration,(gpsEnd-anchor)/1000)};},
  clamp(value,min,max){return Math.max(min,Math.min(max,value));},
  shift(value,delta,min,max){return this.clamp(value+delta,min,max);}
};
