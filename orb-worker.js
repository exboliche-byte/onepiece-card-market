/* El procesado ORB se ejecuta en un hilo independiente para no congelar la cámara. */
"use strict";
let engine=null,cv=null,closed=false,scanning=false;
let loaded=0,failed=0,total=0;
const OPENCV_URL="https://docs.opencv.org/4.13.0/opencv.js";
const post=(type,extra={})=>self.postMessage({type,...extra});
function awaitCV(){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>fail(Error("OpenCV no respondió. Revisa tu conexión.")),25000);
    function fail(error){if(settled)return;settled=true;clearTimeout(timer);reject(error)}
    function done(api){
      if(settled)return;
      if(typeof api?.Mat!=="function"||typeof api?.ORB!=="function"||
         typeof api?.BFMatcher!=="function"||typeof api?.KeyPointVector!=="function"||
         typeof api?.DMatchVector!=="function"){
        fail(Error("OpenCV descargado sin soporte ORB. No se puede escanear con esta versión."));return;
      }
      settled=true;clearTimeout(timer);resolve(api);
    }
    self.Module={onRuntimeInitialized(){
      Promise.resolve(self.cv).then(done,fail);
    },onAbort:x=>fail(Error("Error WASM: "+x))};
    try{
      importScripts(OPENCV_URL);
      Promise.resolve(self.cv).then(x=>{if(x?.Mat)done(x)},fail);
    }catch(e){fail(Error("No se pudo descargar OpenCV.js: "+(e.message||e)))}
  });
}
async function initialize(cards){
  try{
    if(typeof OffscreenCanvas==="undefined"||typeof createImageBitmap!=="function"){
      throw Error("Este navegador no permite procesar imágenes en segundo plano. Prueba Chrome actualizado.");
    }
    post("status",{message:"Cargando módulo visual OpenCV en segundo plano…"});
    importScripts("/orb-engine.js?v=orbworker3");
    cv=await awaitCV();
    if(closed)return;
    engine=new self.OptcgOrbEngine(cv);
    await engine.prepareCache();
    total=cards.length;
    post("ready",{total});
    if(!total){post("progress",{loaded,failed,total,done:true});return}
    // Se priorizan las cartas de la colección y se permite intercalar fotogramas.
    for(let i=0;i<cards.length&&!closed;i++){
      try{if(await engine.indexCard(cards[i]))loaded++;else failed++}
      catch{failed++}
      if(i<15||i%5===0||i===cards.length-1)
        post("progress",{loaded,failed,total,processed:i+1,done:i===cards.length-1});
      await new Promise(resolve=>setTimeout(resolve,12));
    }
  }catch(error){post("error",{message:String(error?.message||error)})}
}
self.onmessage=async ({data})=>{
  if(closed)return;
  if(data.type==="start"){void initialize(data.cards||[]);return}
  if(data.type!=="frame"||!engine||!loaded||scanning)return;
  scanning=true;
  try{
    const pixels=new Uint8ClampedArray(data.pixels);
    if(pixels.length!==320*448*4)throw Error("Fotograma incorrecto");
    const image=new ImageData(pixels,320,448);
    const r=engine.scan(image);
    post("result",{best:r.best?{id:r.best.card.id,good:r.best.good,cells:r.best.cells}:null,
      second:r.second?{id:r.second.card.id,good:r.second.good,cells:r.second.cells}:null,
      features:r.features,loaded});
  }catch(error){post("frameError",{message:String(error?.message||error)})}
  finally{scanning=false}
};
