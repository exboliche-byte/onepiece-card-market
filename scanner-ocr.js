// Scanner de códigos impresos One Piece TCG (sin índice remoto de imágenes).
// Un único Tesseract Worker reutilizable procesa solo la esquina del código.
const SOURCES=[
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js"
];
let libraryPromise=null;
export function normalizeCode(raw){
  let t=String(raw||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]/g,"");
  const prefix=t.match(/^(OP|0P|ST|5T|EB|E8|PRB|PR8)([0-9OILSB]{5})$/);
  if(prefix){
    const map={O:"0",I:"1",L:"1",S:"5",B:"8"};
    const number=prefix[2].replace(/[OILSB]/g,ch=>map[ch]);
    const kind={"0P":"OP","5T":"ST","E8":"EB","PR8":"PRB"}[prefix[1]]||prefix[1];
    if(/^\d{5}$/.test(number))return kind+number.slice(0,2)+"-"+number.slice(2);
  }
  const promo=t.match(/^P([0-9OILSB]{3})$/);
  if(promo){
    const number=promo[1].replace(/[OILSB]/g,ch=>({O:"0",I:"1",L:"1",S:"5",B:"8"}[ch]));
    if(/^\d{3}$/.test(number))return "P-"+number;
  }
  return "";
}
export function codesFromText(text){
  // La lectura de una línea suele introducir espacios, puntos o saltos dentro del ID.
  const upper=String(text||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  const results=new Set();
  const spaced=upper.replace(/[\r\n]+/g," ");
  const find=/(?:^|[^A-Z0-9])((?:OP|0P|ST|5T|EB|E8|PRB|PR8)[ .:_-]*[0-9OILSB]{2}[ .:_-]*[0-9OILSB]{3}|P[ .:_-]*[0-9OILSB]{3})(?=$|[^A-Z0-9])/g;
  for(const m of spaced.matchAll(find)){const code=normalizeCode(m[1]);if(code)results.add(code)}
  // En el texto del pie de carta a veces falta el separador visual.
  for(const word of spaced.split(/\s+/)){const code=normalizeCode(word);if(code)results.add(code)}
  return [...results];
}
function script(url){
  return new Promise((resolve,reject)=>{
    const el=document.createElement("script");el.src=url;el.async=true;
    const timer=setTimeout(()=>finish(Error("Tiempo agotado descargando el motor OCR")),16000);
    const finish=(error)=>{
      clearTimeout(timer);el.onload=el.onerror=null;
      if(error){el.remove();reject(error)}else resolve();
    };
    el.onload=()=>window.Tesseract?finish():finish(Error("Tesseract no se inicializó"));
    el.onerror=()=>finish(Error("Error de red descargando OCR"));
    document.head.appendChild(el);
  });
}
async function loadLibrary(){
  if(window.Tesseract)return window.Tesseract;
  if(!libraryPromise)libraryPromise=(async()=>{
    let error;
    for(const src of SOURCES){
      try{await script(src);return window.Tesseract}
      catch(e){error=e}
    }
    throw error||Error("No se pudo cargar OCR");
  })().catch(e=>{libraryPromise=null;throw e});
  return libraryPromise;
}
function crop(canvas,area,contrast=true){
  const sx=Math.floor(canvas.width*area[0]),sy=Math.floor(canvas.height*area[1]);
  const sw=Math.max(2,Math.floor(canvas.width*area[2])),sh=Math.max(2,Math.floor(canvas.height*area[3]));
  const result=document.createElement("canvas");
  result.width=area[4]||1100;
  result.height=Math.max(100,Math.round(result.width*sh/sw));
  const ctx=result.getContext("2d",{willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,result.width,result.height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(canvas,sx,sy,sw,sh,0,0,result.width,result.height);
  if(contrast){
    const pix=ctx.getImageData(0,0,result.width,result.height),d=pix.data;
    for(let i=0;i<d.length;i+=4){
      const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      const value=Math.max(0,Math.min(255,(gray-128)*1.52+128));
      d[i]=d[i+1]=d[i+2]=value;
    }
    ctx.putImageData(pix,0,0);
  }
  return result;
}
export function createEngine(onProgress=()=>{}){
  let worker=null,creating=null,closed=false,activeMode=null;
  async function init(){
    if(closed)throw Error("Escáner cerrado");
    if(worker)return worker;
    if(creating)return creating;
    creating=(async()=>{
      onProgress("Descargando motor OCR y datos de idioma…");
      const api=await loadLibrary();
      if(closed)throw Error("Escáner cerrado");
      const created=await api.createWorker("eng",1,{
        logger:m=>{
          if(closed||!m?.status)return;
          if(m.status==="recognizing text")return;
          const percent=Number.isFinite(m.progress)?Math.round(m.progress*100):null;
          onProgress("Preparando OCR: "+m.status+(percent===null?"":" "+percent+"%"));
        }
      });
      if(closed){await created.terminate();throw Error("Escáner cerrado")}
      worker=created;
      await worker.setParameters({
        tessedit_pageseg_mode:api.PSM?.SINGLE_LINE||"7",
        tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ",
        user_defined_dpi:"150"
      });
      activeMode="line";
      return worker;
    })().catch(e=>{creating=null;throw e});
    return creating;
  }
  async function recognize(frame,count){
    const w=await init();
    if(closed)throw Error("Escáner cerrado");
    const api=window.Tesseract;
    // Tres pasadas cíclicas: esquina del ID, toda la banda inferior, texto de la carta.
    const mode=count%6===0?"full":count%4===0?"bottom":"corner";
    const config=mode==="corner"?"line":"sparse";
    if(config!==activeMode){
      await w.setParameters({tessedit_pageseg_mode:config==="line"?(api.PSM?.SINGLE_LINE||"7"):(api.PSM?.SPARSE_TEXT||"11")});
      activeMode=config;
    }
    const region=mode==="corner"?[.39,.80,.61,.20,1150]:
      mode==="bottom"?[0,.72,1,.28,1000]:[0,0,1,1,800];
    const input=crop(frame,region,mode!=="full");
    const result=await w.recognize(input);
    const text=String(result?.data?.text||"");
    return {codes:codesFromText(text),text,mode,confidence:Number(result?.data?.confidence||0)};
  }
  async function destroy(){
    closed=true;
    const created=worker;worker=null;
    if(created){try{await created.terminate()}catch{}}
  }
  return {init,recognize,destroy};
}
