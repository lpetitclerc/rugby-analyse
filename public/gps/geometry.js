const DEFAULT_GEOMETRY={points:{A:[49.385465,2.404981],B:[49.385271,2.405854],C:[49.384406,2.405376],D:[49.384627,2.404428]},rotation:0,mirror:false,flipVertical:false,width:70};
const rad=Math.PI/180,R=6371000;
let geometryConfig,corners,origin,A,D,C,B,U,V,W,fieldRatio;
function compileGeometry(config){
  if(!config||![0,90,180,270].includes(Number(config.rotation)))throw Error('Choisissez une rotation de 0, 90, 180 ou 270°.');
  const width=Number(config.width??70);if(!Number.isFinite(width)||width<=30)throw Error('La largeur doit être supérieure à 30 mètres pour tracer les lignes à 15 mètres de chaque touche.');
  const points={};for(const name of ['A','B','C','D']){const p=config.points?.[name];if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.abs(p[0])>=90||Math.abs(p[1])>180)throw Error(`Coordonnées ${name} invalides : latitude entre −90 et 90, longitude entre −180 et 180.`);points[name]=p.slice();}
  const o=points.A,toXY=p=>[(p[1]-o[1])*rad*R*Math.cos(o[0]*rad),(p[0]-o[0])*rad*R],polygon=['A','B','C','D'].map(n=>toXY(points[n]));
  let sign=0;for(let i=0;i<4;i++){const p=polygon[i],q=polygon[(i+1)%4],r=polygon[(i+2)%4],cross=(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);if(Math.hypot(q[0]-p[0],q[1]-p[1])<1||Math.abs(cross)<1)throw Error('Les coins doivent être distincts et délimiter un terrain non aplati.');if(sign&&Math.sign(cross)!==sign)throw Error('Saisissez A, B, C et D dans l’ordre autour du terrain, sans croiser les côtés.');sign=Math.sign(cross);}
  const [a,d,c,b]=['A','D','C','B'].map(n=>toXY(points[n])),u=d.map((v,i)=>v-a[i]),v=b.map((x,i)=>x-a[i]),w=c.map((x,i)=>x-d[i]-b[i]+a[i]);
  let ratio=(Math.hypot(...u)+Math.hypot(c[0]-b[0],c[1]-b[1]))/(Math.hypot(...v)+Math.hypot(c[0]-d[0],c[1]-d[1]));if(Number(config.rotation)%180)ratio=1/ratio;
  return {config:{points,rotation:Number(config.rotation),mirror:Boolean(config.mirror),flipVertical:Boolean(config.flipVertical),width},origin:o,A:a,D:d,C:c,B:b,U:u,V:v,W:w,ratio};
}
function setGeometry(config){const g=compileGeometry(config);geometryConfig=g.config;corners=['A','D','C','B'].map(n=>g.config.points[n]);origin=g.origin;A=g.A;D=g.D;C=g.C;B=g.B;U=g.U;V=g.V;W=g.W;fieldRatio=g.ratio;}
function getGeometryConfig(){return JSON.parse(JSON.stringify(geometryConfig));}
function xy(lat,lon){return [(lon-origin[1])*rad*R*Math.cos(origin[0]*rad),(lat-origin[0])*rad*R];}
function orientPoint(u,v){let x=u,y=v;switch(geometryConfig.rotation){case 90:x=1-v;y=u;break;case 180:x=1-u;y=1-v;break;case 270:x=v;y=1-u;break;}if(geometryConfig.mirror)x=1-x;if(geometryConfig.flipVertical)y=1-y;return [x,y];}
function project(lat,lon){const p=xy(lat,lon);let u=.5,v=.5;for(let i=0;i<12;i++){const fx=A[0]+U[0]*u+V[0]*v+W[0]*u*v-p[0],fy=A[1]+U[1]*u+V[1]*v+W[1]*u*v-p[1],a=U[0]+W[0]*v,b=V[0]+W[0]*u,c=U[1]+W[1]*v,d=V[1]+W[1]*u,det=a*d-b*c;if(Math.abs(det)<1e-12)return [NaN,NaN];u-=(d*fx-b*fy)/det;v-=(-c*fx+a*fy)/det;if(Math.abs(fx)+Math.abs(fy)<1e-8)break;}return orientPoint(u,v);}
function screenCorners(){return [['A',0,0],['D',1,0],['C',1,1],['B',0,1]].map(([name,u,v])=>[name,...orientPoint(u,v)]);}
// AD et BC sont les touches ; longueur de jeu de 100 m entre AB et DC.
function rugbyMarkings(){
  const lines=[];
  for(const metres of [22,50,78])lines.push({dashed:false,a:[metres/100,0],b:[metres/100,1]});
  for(const metres of [5,95])lines.push({dashed:true,a:[metres/100,0],b:[metres/100,1]});
  for(const metres of [5,15,geometryConfig.width-15,geometryConfig.width-5])lines.push({dashed:true,a:[0,metres/geometryConfig.width],b:[1,metres/geometryConfig.width]});
  return lines.map(line=>({...line,a:orientPoint(...line.a),b:orientPoint(...line.b)}));
}
setGeometry(DEFAULT_GEOMETRY);
