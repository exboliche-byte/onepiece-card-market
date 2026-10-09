/* Compara la ilustración con huellas compactas de impresiones exactas. */
"use strict";
let refs=[],ready=false,busy=false;
const W=160,H=224;
function bitCount(x){x>>>=0;x-=(x>>>1)&0x55555555;x=(x&0x33333333)+((x>>>2)&0x33333333);return (((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24}
function decode(hash){
 if(typeof hash!=="string"||hash.length!==64||!/^[0-9a-f]{64}$/i.test(hash))return null;
 const out=new Uint32Array(8);
 for(let i=0;i<8;i++)out[i]=parseInt(hash.slice(i*8,i*8+8),16)>>>0;
 return out;
}
function distance(a,b){let total=0;for(let i=0;i<8;i++)total+=bitCount((a[i]^b[i])>>>0);return total}
function dhash(pixels,w,h,region,dx=0,dy=0,zoom=1){
 const [x0,y0,x1,y1]=region,ww=(x1-x0)*zoom,hh=(y1-y0)*zoom;
 const left=(x0+x1-ww)*.5+dx,top=(y0+y1-hh)*.5+dy;
 const result=new Uint32Array(8),row=new Float32Array(17);
 for(let y=0;y<16;y++){
  const fy=Math.max(0,Math.min(h-1,(top+(y+.5)*hh/16)*h));
  const yl=Math.floor(fy),yh=Math.min(h-1,yl+1),wy=fy-yl;
  for(let x=0;x<17;x++){
   const fx=Math.max(0,Math.min(w-1,(left+(x+.5)*ww/17)*w));
   const xl=Math.floor(fx),xh=Math.min(w-1,xl+1),wx=fx-xl;
   const a=(yl*w+xl)*4,b=(yl*w+xh)*4,c=(yh*w+xl)*4,d=(yh*w+xh)*4;
   const interpolate=channel=>((pixels[a+channel]*(1-wx)+pixels[b+channel]*wx)*(1-wy)+(pixels[c+channel]*(1-wx)+pixels[d+channel]*wx)*wy);
   row[x]=interpolate(0)*.299+interpolate(1)*.587+interpolate(2)*.114;
  }
  for(let x=0;x<16;x++)if(row[x]>row[x+1]){
   const position=y*16+x;result[position>>>5]|=1<<(31-(position&31));
  }
 }
 return result;
}
function match(pixels,w,h,hints=[],limit=8){
 if(!refs.length)return [];
 const views=[[0,0,1],[-.025,-.02,1.05],[.025,.02,1.05],[0,0,.94]];
 const art=views.map(([dx,dy,z])=>dhash(pixels,w,h,[.05,.10,.95,.72],dx,dy,z));
 const full=dhash(pixels,w,h,[.06,.06,.94,.94]);
 const known=new Set(hints.map(x=>String(x||"").toUpperCase()));
 const scored=[];
 for(const reference of refs){
  let da=256;
  for(const fp of art)da=Math.min(da,distance(fp,reference.art));
  const df=distance(full,reference.full);
  const base=reference.id.replace(/_(?:p|r|c)\d+$/i,"").toUpperCase();
  const codeBonus=known.has(base)?-26:0;
  if(da>120&&!codeBonus)continue;
  scored.push({id:reference.id,score:Math.round(da*.78+df*.22+codeBonus),art:da,whole:df});
 }
 scored.sort((a,b)=>a.score-b.score);
 return scored.slice(0,Math.max(1,Math.min(40,Number(limit)||8)));
}
async function initialize(){
 try{
  const r=await fetch("/data/vision-index.json",{cache:"no-store"});
  if(!r.ok)throw Error("Índice visual no disponible: HTTP "+r.status);
  const data=await r.json();
  if(data.version!==1||!Array.isArray(data.cards))throw Error("Índice incompatible");
  const rows=[];
  for(const [id,a,b] of data.cards){
   const art=decode(a),full=decode(b);
   if(art&&full)rows.push({id:String(id),art,full});
  }
  if(rows.length<750)throw Error("Índice de cartas incompleto");
  refs=rows;ready=true;self.postMessage({type:"ready",count:rows.length});
 }catch(error){self.postMessage({type:"error",message:String(error?.message||error)})}
}
if(typeof self!=="undefined")self.onmessage=({data})=>{
 if(data.type==="init"){void initialize();return}
 if(data.type!=="frame"||!ready||busy)return;
 busy=true;
 try{
  const pixels=new Uint8ClampedArray(data.pixels);
  if(pixels.length!==W*H*4)throw Error("Fotograma inválido");
  const ranked=match(pixels,W,H,data.hints||[],data.limit||8);
  self.postMessage({type:"result",ranked,frames:data.frames});
 }catch(error){self.postMessage({type:"frame-error",message:String(error?.message||error)})}
 finally{busy=false}
};
if(typeof globalThis!=="undefined")globalThis.__visionTest={decode,dhash,distance,match,setRefs:v=>{refs=v}};
