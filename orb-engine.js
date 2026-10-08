// Reconocimiento ORB local: WebAssembly + imágenes públicas convertidas en el propio navegador.
// IndexedDB almacena solamente descriptores de cartas; NO almacena fotogramas ni datos personales.
const URL_OPENCV="https://docs.opencv.org/4.13.0/opencv.js";
let cvPromise;
function loadCV(){
  if(cvPromise)return cvPromise;
  cvPromise=new Promise((resolve,reject)=>{
    let finished=false;
    const timer=setTimeout(()=>fail(Error("OpenCV WebAssembly no responde")),60000);
    function fail(err){if(finished)return;finished=true;clearTimeout(timer);reject(err)}
    function finish(api){
      if(finished)return;
      if(!api?.Mat||!api?.ORB||!api?.BFMatcher||!api?.KeyPointVector||!api?.DMatchVector){
        fail(Error("Esta versión de OpenCV no contiene ORB/BFMatcher."));return;
      }
      finished=true;clearTimeout(timer);resolve(api);
    }
    const original=window.Module||{};
    window.Module={...original,onRuntimeInitialized(){
      original.onRuntimeInitialized?.();
      Promise.resolve(window.cv).then(finish,fail);
    },onAbort:r=>fail(Error("OpenCV: "+r))};
    if(window.cv){Promise.resolve(window.cv).then(x=>{if(x?.Mat)finish(x)}).catch(fail)}
    const tag=document.createElement("script");
    tag.src=URL_OPENCV;tag.async=true;tag.onerror=()=>fail(Error("No se puede cargar OpenCV.js"));
    tag.onload=()=>Promise.resolve(window.cv).then(x=>{if(x?.Mat)finish(x)}).catch(fail);
    document.head.appendChild(tag);
  }).catch(e=>{cvPromise=null;throw e});
  return cvPromise;
}
const BUCKETS=[[0,5,11],[1,9,20],[3,15,27]];
function keys(bytes,start){
  return BUCKETS.map(([a,b,c],i)=>(i<<12)|((bytes[start+a]&15)<<8)|((bytes[start+b]&15)<<4)|(bytes[start+c]&15));
}
function encode(bytes){
  let out="";
  for(let i=0;i<bytes.length;i+=4096)out+=String.fromCharCode(...bytes.subarray(i,i+4096));
  return btoa(out);
}
function decode(s){const raw=atob(s),arr=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return arr}
function hash(gray,cv){
  const tiny=new cv.Mat();
  try{
    cv.resize(gray,tiny,new cv.Size(9,8),0,0,cv.INTER_AREA);
    let num=0n;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)num=(num<<1n)|BigInt(tiny.data[y*9+x]>tiny.data[y*9+x+1]);
    return num.toString(16).padStart(16,"0");
  }finally{tiny.delete()}
}
function countBits(v){
  v>>>=0;v-=(v>>>1)&0x55555555;
  v=(v&0x33333333)+((v>>>2)&0x33333333);
  return (((v+(v>>>4))&0x0f0f0f)*0x01010101)>>>24;
}
function hdist(a,b){
  if(!a||!b)return 64;
  return countBits(parseInt(a.slice(0,8),16)^parseInt(b.slice(0,8),16))+
         countBits(parseInt(a.slice(8),16)^parseInt(b.slice(8),16));
}
function dbOpen(){
  return new Promise(resolve=>{
    if(!window.indexedDB){resolve(null);return}
    const req=indexedDB.open("optcg-orb-descriptors",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("images");
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(null);
    req.onblocked=()=>resolve(null);
  });
}
function dbRead(db,id){
  if(!db)return Promise.resolve(null);
  return new Promise(resolve=>{
    try{
      const req=db.transaction("images","readonly").objectStore("images").get("orb13:"+id);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>resolve(null);
    }catch{resolve(null)}
  });
}
function dbWrite(db,id,data){
  if(!db)return;
  try{db.transaction("images","readwrite").objectStore("images").put(data,"orb13:"+id)}
  catch{ /* navegación privada o cuota llena: continuar sin caché */ }
}
async function loadImage(url){
  if(typeof createImageBitmap==="function"){
    const response=await fetch(url,{cache:"force-cache"});
    if(!response.ok)throw Error("HTTP "+response.status);
    const blob=await response.blob();
    if(!blob.type.startsWith("image/"))throw Error("No es una imagen");
    return await createImageBitmap(blob);
  }
  return await new Promise((resolve,reject)=>{
    const image=new Image();image.crossOrigin="anonymous";
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(Error("No se pudo abrir la referencia"));
    image.src=url;
  });
}
class OrbEngine {
  constructor(cv){
    this.cv=cv;this.disposed=false;
    this.orb=new cv.ORB(1000);
    this.matcher=new cv.BFMatcher(cv.NORM_HAMMING,true);
    this.mask=new cv.Mat();
    this.cards=[];
    this.postings=new Map();
    this.frame=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(320,448):document.createElement("canvas");
    this.frame.width=320;this.frame.height=448;
    this.ref=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(320,448):document.createElement("canvas");
    this.ref.width=320;this.ref.height=448;
    this.refCtx=this.ref.getContext("2d",{willReadFrequently:true});
    this.db=null;
  }
  async prepareCache(){this.db=await dbOpen()}
  add(item, card){
    if(this.disposed)return false;
    if(!item||item.rows<30||!item.descriptorBase64)return false;
    const bytes=decode(item.descriptorBase64);
    if(bytes.length!==item.rows*32)return false;
    const mat=new this.cv.Mat(item.rows,32,this.cv.CV_8UC1);
    mat.data.set(bytes);
    const idx=this.cards.length;
    this.cards.push({id:card.id,baseId:card.baseId,name:card.name,printSet:card.printSet,
      hash:item.hash,descriptors:mat});
    const unique=new Set();
    for(let row=0;row<item.rows;row+=3)for(const k of keys(bytes,row*32))unique.add(k);
    for(const k of unique){
      const list=this.postings.get(k);
      if(list)list.push(idx);else this.postings.set(k,[idx]);
    }
    return true;
  }
  extract(canvas){
    const cv=this.cv,src=new cv.Mat(canvas.height,canvas.width,cv.CV_8UC4),gray=new cv.Mat(),enhanced=new cv.Mat();
    src.data.set(canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data);
    const kp=new cv.KeyPointVector(),desc=new cv.Mat();
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
      cv.equalizeHist(gray,enhanced);
      this.orb.detectAndCompute(enhanced,this.mask,kp,desc);
      return {rows:desc.rows,hash:hash(enhanced,cv),descriptorBase64:desc.rows>=30?encode(desc.data):""};
    }finally{desc.delete();kp.delete();enhanced.delete();gray.delete();src.delete()}
  }
  async indexCard(card){
    let saved=await dbRead(this.db,card.id);
    if(this.disposed)return false;
    if(saved&&this.add(saved,card))return true;
    for(const url of ["/orb-image/"+encodeURIComponent(card.id),"/orb-official/"+encodeURIComponent(card.id)]){
      let image;
      try{
        image=await loadImage(url);
        if(this.disposed)return false;
        this.refCtx.clearRect(0,0,320,448);
        this.refCtx.drawImage(image,0,0,320,448);
        saved=this.extract(this.ref);
        if(this.add(saved,card)){dbWrite(this.db,card.id,saved);return true}
      }catch(e){
        if(e?.name==="SecurityError")throw Error("Las imágenes no permiten procesarse por CORS.");
      }finally{if(image?.close)image.close();else if(image)image.src=""}
    }
    return false;
  }
  scan(cardCanvas){
    if(!this.cards.length)return {best:null,second:null,features:0};
    const cv=this.cv,ctx=this.frame.getContext("2d",{willReadFrequently:true});
    if(cardCanvas instanceof ImageData)ctx.putImageData(cardCanvas,0,0);
    else ctx.drawImage(cardCanvas,0,0,320,448);
    const src=new cv.Mat(448,320,cv.CV_8UC4),gray=new cv.Mat(),enhanced=new cv.Mat();
    src.data.set(ctx.getImageData(0,0,320,448).data);
    const kp=new cv.KeyPointVector(),desc=new cv.Mat();
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.equalizeHist(gray,enhanced);
      this.orb.detectAndCompute(enhanced,this.mask,kp,desc);
      if(desc.rows<30)return {best:null,second:null,features:desc.rows};
      const votes=new Uint16Array(this.cards.length),seen=new Set(),bytes=desc.data;
      for(let row=0;row+32<=bytes.length;row+=64){
        for(const key of keys(bytes,row)){
          if(seen.has(key))continue;seen.add(key);
          for(const idx of this.postings.get(key)||[])votes[idx]++;
        }
      }
      const ranked=this.cards.map((_,i)=>i).sort((a,b)=>votes[b]-votes[a]);
      const shortlisted=new Set(ranked.filter(i=>votes[i]>0).slice(0,20));
      const sceneHash=hash(enhanced,cv);
      this.cards.map((c,i)=>({i,d:hdist(sceneHash,c.hash)}))
        .sort((a,b)=>a.d-b.d).slice(0,12).forEach(x=>shortlisted.add(x.i));
      const results=[];
      for(const idx of [...shortlisted].slice(0,30)){
        const ref=this.cards[idx],matches=new cv.DMatchVector();
        try{
          this.matcher.match(desc,ref.descriptors,matches);
          let good=0;const cells=new Set();
          for(let j=0;j<matches.size();j++){
            const m=matches.get(j);
            if(m.distance>64)continue;
            good++;
            const p=kp.get(m.queryIdx).pt;
            cells.add(Math.min(5,Math.floor(p.y*6/448))*4+Math.min(3,Math.floor(p.x*4/320)));
          }
          results.push({card:ref,good,cells:cells.size});
        }finally{matches.delete()}
      }
      results.sort((a,b)=>b.good-a.good||b.cells-a.cells);
      return {best:results[0]||null,second:results[1]||null,features:desc.rows};
    }finally{desc.delete();kp.delete();enhanced.delete();gray.delete();src.delete()}
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    this.cards.forEach(x=>x.descriptors.delete());
    this.cards=[];this.postings.clear();
    this.db?.close();this.db=null;
    this.mask.delete();this.matcher.delete();this.orb.delete();
  }
}

self.OptcgOrbEngine=OrbEngine;
