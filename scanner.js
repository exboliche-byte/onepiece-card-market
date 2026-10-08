(()=>{
"use strict";
// Zero paid recognition calls: Tesseract's neural OCR model runs in the browser.
// Never save an OCR guess automatically: each printing must be confirmed by the user.
let camera=null,stream=null,track=null,worker=null,workerPromise=null,workerToken=0;
let running=false,locked=false,processing=false,scanTimer=null,session=0;
let lastCode="",lastSeenAt=0,repeatCount=0,attempts=0,shot=null,activeHit=null;
let torch=false,facing="environment",cameraStarting=false,resizeWatcher=null,wakeLock=null;
const OCR_SRC="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const $=q=>document.querySelector("#scanPanel "+q);
const panel=()=>document.querySelector("#scanPanel");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&#39;","'":"&#39;"}[c]));
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
const idBase=id=>String(baseId(id||"")).toUpperCase();
const stillActive=t=>running&&!locked&&t===session&&!!panel();
const status=(msg)=>{const e=$("#scanStatus");if(e)e.textContent=msg};
const hint=(msg)=>{const e=$("#scanHint");if(e)e.textContent=msg};
const style=document.createElement("style");style.id="scanStyles";
style.textContent=[
"#scanLaunch{position:fixed;right:14px;bottom:80px;z-index:200;background:#ffd447;color:#171717;font-weight:850;padding:13px 15px;border:0;border-radius:30px;box-shadow:0 4px 15px #0008;cursor:pointer}",
"#scanPanel{position:fixed;inset:0;z-index:9999;background:#080b11;color:#f6f6f6;font-family:system-ui,sans-serif;height:100vh;height:100dvh;overflow:hidden}",
"#scanPanel *{box-sizing:border-box}#scanPanel .scanLayout{display:flex;flex-direction:column;gap:7px;width:100%;max-width:780px;height:100%;margin:auto;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px calc(env(safe-area-inset-bottom,0px) + 10px)}",
"#scanPanel .scanTop{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}#scanPanel h2{font-size:17px;line-height:1.15;margin:0}",
"#scanPanel button{appearance:none;border:1px solid #596a84;border-radius:9px;padding:10px;background:#253145;color:#fff;font-size:13px;font-weight:750;cursor:pointer}",
"#scanPanel button:disabled{opacity:.45;cursor:default}#scanPanel .primary{background:#ffd447;color:#121212;border-color:#ffd447}",
"#scanPanel #scanStatus{min-height:20px;font-size:13px;line-height:1.35;color:#e5edfa;flex:none}#scanPanel #scanHint{min-height:17px;font-size:11px;color:#aebed0;flex:none}",
"#scanPanel .scanStage{position:relative;flex:1;min-height:0;overflow:hidden;border:1px solid #344156;border-radius:12px;background:#000}",
"#scanPanel .scanStage video,#scanPanel .scanFreeze{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}",
"#scanPanel .scanGuide{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border:2px solid #ffd447;box-shadow:0 0 0 100vmax #0006;border-radius:11px;pointer-events:none}",
"#scanPanel .scanGuide:before,#scanPanel .scanGuide:after{content:'';position:absolute;left:10%;right:10%;height:1px;background:#ffd44777}#scanPanel .scanGuide:before{top:24%}#scanPanel .scanGuide:after{bottom:18%}",
"#scanPanel .scanCounter{position:absolute;z-index:2;left:8px;top:8px;border:1px solid #fff4;border-radius:7px;background:#09111ae8;padding:6px 9px;font-size:11px;color:#e8eefb}",
"#scanPanel .scanActions{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;flex:none}#scanPanel .scanActions button{flex:1;min-width:100px}",
"#scanPanel .scanTools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;flex:none}#scanPanel .scanTools button{padding:8px 10px;font-size:12px}#scanPanel .scanTools label{font-size:12px;color:#ccd5e2;display:flex;align-items:center;gap:5px}#scanPanel .scanTools input{width:95px}",
"#scanPanel .scanDecision{position:absolute;z-index:4;inset:auto 5px 5px;max-height:90%;overflow-y:auto;background:#0d1522f5;border:1px solid #ffd447;border-radius:13px;padding:11px;box-shadow:0 8px 28px #000d}",
"#scanPanel .scanDecision[hidden]{display:none}#scanPanel .scanIdentity{display:flex;align-items:flex-start;gap:9px}#scanPanel .scanIdentity img{width:72px;aspect-ratio:.716;object-fit:contain;border-radius:5px}",
"#scanPanel .scanIdentity strong{font-size:16px}#scanPanel .small{font-size:12px;color:#cad4e4}#scanPanel select,#scanPanel input[type=number],#scanPanel input[type=search]{color:#fff;background:#1d2b42;border:1px solid #68758b;border-radius:8px;padding:10px;font:inherit}",
"#scanPanel select{width:100%}#scanPanel input[type=search]{width:100%}#scanPanel .scanChoiceButtons{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:10px 0}#scanPanel .scanChoiceButtons button{flex:1}#scanPanel .scanChoiceButtons input{width:67px}",
"#scanPanel .scanSearchResults{display:grid;gap:5px;margin-top:8px}#scanPanel .scanSearchResults button{width:100%;text-align:left}#scanPanel .scanScroll{max-height:43vh;overflow-y:auto}",
"#scanPanel .scanHelp{font-size:11px;color:#a8b6cb;text-align:center;flex:none}",
"@media (min-width:760px){#scanPanel .scanLayout{padding-left:15px;padding-right:15px}#scanPanel .scanActions button{max-width:240px}}"
].join("");
document.head.appendChild(style);

function normalizeCode(raw){
  const compact=norm(raw).replace(/[^A-Z0-9]/g,"").replace(/^0P/,"OP").replace(/^5T/,"ST").replace(/^E8/,"EB").replace(/^PR8/,"PRB");
  // OCR often confuses I/l with 1 and O with zero in the numeric region.
  const candidate=compact.match(/^(OP|ST|EB|PRB)([0-9OILSB]{2})([0-9OILSB]{3})$/);
  if(candidate){
    const digits=(candidate[2]+candidate[3]).replace(/[IL]/g,"1").replace(/O/g,"0").replace(/S/g,"5").replace(/B/g,"8");
    if(/^\d{5}$/.test(digits))return candidate[1]+digits.slice(0,2)+"-"+digits.slice(2);
  }
  const promo=compact.match(/^P([0-9OILSB]{3})$/);
  if(promo){
    const number=promo[1].replace(/[IL]/g,"1").replace(/O/g,"0").replace(/S/g,"5").replace(/B/g,"8");
    if(/^\d{3}$/.test(number))return "P-"+number;
  }
  return "";
}
function codeCandidates(text){
  const compact=norm(text).replace(/[^A-Z0-9]/g,"");
  // Missing/damaged punctuation is normal when scanning physical glossy cards.
  const pattern=/(?:OP|0P|ST|5T|EB|E8|PRB|PR8)[0-9OILSB]{5}|P[0-9OILSB]{3}/g;
  const matches=compact.match(pattern)||[];
  return [...new Set(matches.map(normalizeCode).filter(Boolean))];
}
function cardByCode(code){
  if(!code)return [];
  return state.cards.filter(c=>normalizeCode(idBase(c.id))===code);
}
function lookup(text){
  const codes=codeCandidates(text);
  for(const code of codes){
    const choices=cardByCode(code);
    if(choices.length){
      const main=choices.find(c=>normalizeCode(c.id)===code)||choices[0];
      return {card:main,code,variants:choices,source:"Código leído",confidence:"high"};
    }
  }
  const raw=norm(text);
  if(raw.length<5)return null;
  // Name-only matches are permitted only when the entire catalog has exactly
  // one logical card with this name; duplicate card names are never guessed.
  const uniqueNames=new Map();
  for(const c of state.cards){
    const name=norm(c.name);if(name.length<5)continue;
    if(raw.includes(name)){
      if(!uniqueNames.has(name))uniqueNames.set(name,new Set());
      uniqueNames.get(name).add(idBase(c.id));
    }
  }
  const possible=[...uniqueNames.entries()].filter(([,ids])=>ids.size===1).sort((a,b)=>b[0].length-a[0].length);
  if(possible.length!==1)return null;
  const code=[...possible[0][1]][0];
  const choices=state.cards.filter(c=>idBase(c.id)===code);
  return choices.length?{card:choices[0],code,variants:choices,source:"Nombre leído (verificar)",confidence:"medium"}:null;
}
function fitGuide(){
  const stage=$(".scanStage"),guide=$(".scanGuide");
  if(!stage||!guide)return;
  const w=Math.max(100,stage.clientWidth),h=Math.max(100,stage.clientHeight);
  const height=Math.min(h*.85,w*.87/.716),width=height*.716;
  guide.style.width=Math.round(width)+"px";guide.style.height=Math.round(height)+"px";
}
function visibleVideoBounds(){
  if(!camera||camera.readyState<2||!camera.videoWidth||!camera.videoHeight)return null;
  const r=camera.getBoundingClientRect(),w=camera.videoWidth,h=camera.videoHeight;
  if(!r.width||!r.height)return null;
  const factor=Math.max(r.width/w,r.height/h);
  const offsetX=(w*factor-r.width)/2,offsetY=(h*factor-r.height)/2;
  return {r,w,h,factor,offsetX,offsetY};
}
function snapshot(){
  const b=visibleVideoBounds(),guide=$(".scanGuide");
  if(!b||!guide)return null;
  const g=guide.getBoundingClientRect();
  const left=Math.max(0,(g.left-b.r.left+b.offsetX)/b.factor);
  const top=Math.max(0,(g.top-b.r.top+b.offsetY)/b.factor);
  const cropW=Math.min(b.w-left,g.width/b.factor),cropH=Math.min(b.h-top,g.height/b.factor);
  if(cropW<100||cropH<100)return null;
  const crop=document.createElement("canvas");
  crop.width=Math.min(900,Math.round(cropW*1.25));
  crop.height=Math.round(crop.width*cropH/cropW);
  crop.getContext("2d").drawImage(camera,left,top,cropW,cropH,0,0,crop.width,crop.height);
  const still=document.createElement("canvas");
  still.width=Math.min(780,Math.round(b.r.width*1.5));
  still.height=Math.max(1,Math.round(still.width*b.r.height/b.r.width));
  const stillX=b.offsetX/b.factor,stillY=b.offsetY/b.factor;
  still.getContext("2d").drawImage(camera,stillX,stillY,Math.min(b.w-stillX,b.r.width/b.factor),Math.min(b.h-stillY,b.r.height/b.factor),0,0,still.width,still.height);
  return {card:crop,still:still.toDataURL("image/jpeg",.79)};
}
function cropForCode(card){
  // One Piece IDs are printed in the lower portion of each card.
  const c=document.createElement("canvas"),w=card.width,h=card.height;
  c.width=Math.min(1400,Math.round(w*1.6));
  c.height=Math.round(c.width*.29*h/w);
  const g=c.getContext("2d");
  if("filter" in g)g.filter="grayscale(1) contrast(1.7)";
  g.drawImage(card,0,h*.71,w,h*.29,0,0,c.width,c.height);
  return c;
}
function plan(wait=260){
  clearTimeout(scanTimer);
  if(!running||locked||document.hidden)return;
  scanTimer=setTimeout(scan,wait);
}
async function getWorker(turn){
  if(worker)return worker;
  if(workerPromise)return workerPromise;
  workerPromise=(async()=>{
    if(!window.Tesseract){
      await new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src=OCR_SRC;script.async=true;script.onload=resolve;
        script.onerror=()=>reject(Error("No se pudo cargar el OCR gratuito"));
        document.head.appendChild(script);
      });
    }
    if(turn!==session||!running)throw Error("Escáner cerrado");
    const own=await window.Tesseract.createWorker("eng");
    if(turn!==session||!running){await own.terminate();throw Error("Escáner cerrado")}
    await own.setParameters({
      tessedit_pageseg_mode:window.Tesseract.PSM?.SPARSE_TEXT||"11",
      tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- "
    });
    worker=own;return own;
  })().catch(e=>{workerPromise=null;throw e});
  return workerPromise;
}
async function recognizeCard(frame,turn){
  const engine=await getWorker(turn);
  if(turn!==session||!running||locked)return null;
  // Recognize the bottom strip first (fast, where the printed ID lives).
  const bottom=await engine.recognize(cropForCode(frame.card));
  if(turn!==session||!running||locked)return null;
  let found=lookup(bottom?.data?.text||"");
  if(found?.confidence==="high")return found;
  // Periodically inspect the entire card for cards whose code is outside the
  // crop, rotated, or poorly focused. This also allows unique-name detection.
  if(attempts%2!==0)return found;
  const full=await engine.recognize(frame.card);
  if(turn!==session||!running||locked)return null;
  const alternate=lookup(full?.data?.text||"");
  if(alternate?.confidence==="high")return alternate;
  return alternate||found;
}
function remember(hit,frame){
  const now=Date.now(),code=hit.code;
  if(lastCode===code&&now-lastSeenAt<17000)repeatCount++;
  else repeatCount=1;
  lastCode=code;lastSeenAt=now;
  if(repeatCount>=2){
    shot=frame;activeHit=hit;show(hit);
    return true;
  }
  status("Posible "+hit.card.name+" · verificando en otra imagen…");
  return false;
}
async function scan(){
  if(!running||locked||processing||document.hidden)return;
  const turn=session;processing=true;attempts++;
  const counter=$(".scanCounter");if(counter)counter.textContent="Intento "+attempts+" · OCR local";
  try{
    const frame=snapshot();
    if(!frame){status("Encuadra toda la carta dentro del recuadro");return}
    status("Reconociendo carta… búsqueda continua activa");
    const hit=await recognizeCard(frame,turn);
    if(turn!==session||!running||locked)return;
    if(hit){if(remember(hit,frame))return}
    else status("Buscando… centra la carta, mantén el móvil quieto y evita reflejos");
  }catch(e){
    if(turn===session&&running&&!locked){
      console.warn("Scanner local OCR",e);
      status("OCR local no disponible: "+(e?.message||"error")+". Reintentando; puedes buscar manualmente.");
      if(worker){try{await worker.terminate()}catch{}worker=null}workerPromise=null;
    }
  }finally{
    processing=false;
    if(running&&!locked)plan(350);
  }
}
function ownedCount(id){return Number(qty(id)||0)}
function chooseVariant(variants,selected){
  const selection=$("#scanVariant");
  if(!selection)return;
  const current=variants.find(c=>c.id===selection.value);
  const pic=$("#scanFoundImage"),count=$("#scanExactCount");
  if(count)count.textContent=current?"Tienes "+ownedCount(current.id)+" copias de esta impresión.":"Selecciona una impresión exacta para guardarla.";
  if(pic&&current){
    pic.src=imageCdnUrl(current);
    pic.onerror=()=>{pic.onerror=null;pic.src=officialImageUrl(current)};
  }
}
function show(hit){
  if(!running||!hit?.card)return;
  locked=true;clearTimeout(scanTimer);
  const p=panel();p?.classList.add("locked");
  const videoStill=document.createElement("img");
  videoStill.className="scanFreeze";videoStill.src=shot?.still||"";
  $(".scanFreeze")?.remove();$(".scanStage").prepend(videoStill);
  if(camera)camera.style.visibility="hidden";
  const variants=hit.variants||cardByCode(hit.code);
  const owned=variants.reduce((total,c)=>total+ownedCount(c.id),0);
  const limit=playsetTarget(hit.card);
  const options='<option value="">Elige la impresión exacta…</option>'+variants.map(c=>
    '<option value="'+esc(c.id)+'"'+(variants.length===1?' selected':'')+'>'+esc(c.id)+" · "+esc(variantKindOf(c))+" · "+esc(printSetOf(c))+'</option>'
  ).join("");
  const area=$("#scanDecision");area.hidden=false;
  area.innerHTML='<div class="scanIdentity">'+
    '<img id="scanFoundImage" src="'+esc(imageCdnUrl(hit.card))+'" alt="Carta reconocida">'+
    '<div><strong>'+esc(hit.card.name)+'</strong><div class="small">'+esc(hit.code)+' · '+esc(hit.source)+'</div>'+
    '<div class="small">Tienes '+owned+' copias de esta carta · '+Math.max(0,limit-owned)+' para el playset</div></div></div>'+
    '<p class="small">Confirma la impresión. Las paralelas y reimpresiones comparten código y no son intercambiables.</p>'+
    '<select id="scanVariant">'+options+'</select><div id="scanExactCount" class="small"></div>'+
    '<div class="scanChoiceButtons"><button class="primary" id="scanAddOne">+1 y continuar</button>'+
    '<input type="number" min="1" max="99" value="2" id="scanQuantity" aria-label="Número de copias">'+
    '<button class="primary" id="scanAddMany">Añadir y continuar</button></div>'+
    '<div class="scanChoiceButtons"><button id="scanDiscard">Descartar y seguir</button><button id="scanSearchAgain">Buscar otra carta</button></div>';
  const selected=()=>variants.find(c=>c.id===$("#scanVariant")?.value);
  $("#scanVariant").onchange=()=>chooseVariant(variants);
  chooseVariant(variants);
  const save=async howMany=>{
    if(!state.user||!state.collectionReady||!state.sb){
      status("Inicia sesión para guardar en la colección.");return;
    }
    const card=selected(),amount=Number(howMany);
    if(!card){status("Elige la impresión exacta antes de añadir.");return}
    if(!Number.isInteger(amount)||amount<1||amount>99){status("Introduce entre 1 y 99 copias.");return}
    const before=ownedCount(card.id),after=Math.min(99,before+amount);
    if(after===before){status("Has alcanzado el límite de copias.");return}
    const one=$("#scanAddOne"),many=$("#scanAddMany");one.disabled=many.disabled=true;
    status("Guardando la impresión exacta en Supabase…");
    const ok=await setQty(card.id,after);
    if(!running||!panel())return;
    one.disabled=many.disabled=false;
    if(!ok){status("No se ha confirmado el guardado en Supabase. No se ha añadido.");return}
    resume();
    status("Guardadas "+(after-before)+" copia(s) de "+card.id+". Escaneando de nuevo.");
  };
  $("#scanAddOne").onclick=()=>save(1);
  $("#scanAddMany").onclick=()=>save($("#scanQuantity").value);
  $("#scanDiscard").onclick=resume;
  $("#scanSearchAgain").onclick=manual;
  status("Carta detectada. Comprueba la versión antes de guardar.");
}
function releaseFreeze(){
  locked=false;panel()?.classList.remove("locked");
  $(".scanFreeze")?.remove();if(camera)camera.style.visibility="";
  const area=$("#scanDecision");if(area){area.hidden=true;area.replaceChildren()}
}
function resume(){
  if(!running)return;
  session++;lastCode="";repeatCount=0;lastSeenAt=0;shot=null;activeHit=null;
  releaseFreeze();
  status("Buscando de forma continua…");if(!processing)plan(250);
}
function manual(){
  if(!running)return;
  session++;locked=true;clearTimeout(scanTimer);
  const area=$("#scanDecision");area.hidden=false;
  area.innerHTML='<b>Buscar carta manualmente</b><p class="small">Introduce el código o nombre para elegir una impresión.</p>'+
    '<input type="search" id="scanSearch" placeholder="Ej. OP06-043 o Shanks" autocomplete="off">'+
    '<div class="scanSearchResults scanScroll" id="scanHits"></div>'+
    '<button id="scanBack">Volver a escanear</button>';
  $("#scanBack").onclick=resume;
  $("#scanSearch").oninput=e=>{
    const text=norm(e.target.value),hits=$("#scanHits");
    if(text.length<2){hits.innerHTML="";return}
    const results=state.cards.filter(c=>norm(c.id+" "+c.name).includes(text)).slice(0,35);
    hits.innerHTML=results.map(c=>'<button data-found="'+esc(c.id)+'">'+esc(c.id)+' · '+esc(c.name)+'</button>').join("");
    hits.querySelectorAll("[data-found]").forEach(button=>button.onclick=()=>{
      const c=card(button.dataset.found);
      if(!c)return;
      const group=state.cards.filter(x=>idBase(x.id)===idBase(c.id));
      shot=snapshot();
      activeHit={card:c,code:idBase(c.id),variants:group,source:"Búsqueda manual",confidence:"manual"};
      // The selected manual printing is honoured instead of guessing its base.
      show(activeHit);
      const chooser=$("#scanVariant");
      if(chooser){chooser.value=c.id;chooseVariant(group)}
    });
  };
  $("#scanSearch").focus();status("Búsqueda manual · no se guarda nada sin confirmación.");
}
function updateCameraControls(){
  const t=track,cap=t?.getCapabilities?.()||{};
  const torchButton=$("#scanTorch"),zoomControl=$("#scanZoom"),zoomWrap=$("#scanZoomWrap");
  torch=false;
  if(torchButton){torchButton.hidden=!cap.torch;torchButton.textContent="Linterna";torchButton.disabled=false}
  if(zoomWrap)zoomWrap.hidden=!(cap.zoom&&Number.isFinite(cap.zoom.min)&&Number.isFinite(cap.zoom.max)&&cap.zoom.max>cap.zoom.min);
  if(zoomControl&&cap.zoom){
    zoomControl.min=String(cap.zoom.min);zoomControl.max=String(cap.zoom.max);
    zoomControl.step=String(cap.zoom.step||.1);
    zoomControl.value=String(Math.min(cap.zoom.max,Math.max(cap.zoom.min,t.getSettings?.().zoom||cap.zoom.min)));
  }
  if(cap.focusMode?.includes?.("continuous")){
    t.applyConstraints({advanced:[{focusMode:"continuous"}]}).catch(()=>{});
  }
}
async function startCamera(turn){
  if(cameraStarting)return;
  cameraStarting=true;
  status("Abriendo cámara…");
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error("Tu navegador no permite acceder a la cámara");
    let media;
    try{
      media=await navigator.mediaDevices.getUserMedia({audio:false,video:{
        facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:1920},frameRate:{ideal:24}
      }});
    }catch(e){
      if(e.name==="OverconstrainedError"||e.name==="NotFoundError"){
        media=await navigator.mediaDevices.getUserMedia({audio:false,video:true});
      }else throw e;
    }
    if(turn!==session||!running){media.getTracks().forEach(t=>t.stop());return}
    stream=media;track=media.getVideoTracks()[0]||null;
    camera.srcObject=media;
    camera.muted=true;camera.setAttribute("playsinline","");
    await camera.play();
    if(turn!==session||!running)return;
    updateCameraControls();fitGuide();
    status("Cámara activa · buscando cartas sin parar");
    hint("Reconocimiento OCR en el dispositivo. La primera carga puede tardar un poco.");
    plan(250);
    if(navigator.wakeLock?.request)navigator.wakeLock.request("screen").then(lock=>{if(running)wakeLock=lock;else lock.release()}).catch(()=>{});
  }catch(e){
    if(turn===session&&running)status("No se pudo abrir la cámara: "+(e.message||e)+". Revisa los permisos.");
  }finally{cameraStarting=false}
}
async function switchCamera(){
  if(!running)return;
  session++;
  const turn=session;
  clearTimeout(scanTimer);releaseFreeze();
  facing=facing==="environment"?"user":"environment";
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  track=null;if(camera)camera.srcObject=null;
  await startCamera(turn);
}
async function toggleTorch(){
  if(!track||!running)return;
  const next=!torch;
  try{
    await track.applyConstraints({advanced:[{torch:next}]});
    torch=next;
    const button=$("#scanTorch");if(button)button.textContent=torch?"Apagar luz":"Linterna";
  }catch{status("La linterna no está disponible en este dispositivo.")}
}
async function zoomCamera(value){
  if(!track||!running)return;
  try{await track.applyConstraints({advanced:[{zoom:Number(value)}]})}
  catch{status("El zoom no está disponible con esta cámara.")}
}
async function open(){
  if(panel())return;
  if(!state.user||!state.collectionReady||!state.sb){
    alert("Debes iniciar sesión y cargar tu colección de Supabase para escanear cartas.");return;
  }
  if(!state.cards?.length){alert("El catálogo aún no ha terminado de cargar.");return}
  running=true;locked=false;processing=false;attempts=0;lastCode="";repeatCount=0;session++;
  const turn=session;
  const p=document.createElement("section");p.id="scanPanel";
  p.innerHTML='<div class="scanLayout">'+
    '<div class="scanTop"><h2>Escáner gratuito · One Piece</h2><button id="scanClose">✕ Cerrar</button></div>'+
    '<div id="scanStatus" role="status" aria-live="polite">Preparando cámara…</div>'+
    '<div id="scanHint">OCR local · sin servicios de pago</div>'+
    '<div class="scanStage"><video muted playsinline autoplay></video><div class="scanGuide"></div>'+
    '<div class="scanCounter">Escaneo continuo</div><div class="scanDecision" id="scanDecision" hidden></div></div>'+
    '<div class="scanTools"><button id="scanTorch" hidden>Linterna</button>'+
    '<label id="scanZoomWrap" hidden>Zoom <input id="scanZoom" type="range" min="1" max="2" step=".1"></label>'+
    '<button id="scanFlip">Cambiar cámara</button></div>'+
    '<div class="scanActions"><button class="primary" id="scanResume">Continuar escaneando</button>'+
    '<button id="scanManual">Buscar manualmente</button></div>'+
    '<div class="scanHelp">Coloca los cuatro bordes dentro del recuadro. Confirma la impresión antes de añadir copias.</div>'+
    '</div>';
  document.body.appendChild(p);
  camera=$(".scanStage video");
  $("#scanClose").onclick=close;
  $("#scanResume").onclick=resume;
  $("#scanManual").onclick=manual;
  $("#scanTorch").onclick=toggleTorch;
  $("#scanFlip").onclick=switchCamera;
  $("#scanZoom").oninput=e=>zoomCamera(e.target.value);
  if("ResizeObserver" in window){
    resizeWatcher=new ResizeObserver(fitGuide);resizeWatcher.observe($(".scanStage"));
  }else window.addEventListener("resize",fitGuide);
  fitGuide();await startCamera(turn);
}
function close(){
  if(!running&&!panel())return;
  running=false;locked=false;session++;
  clearTimeout(scanTimer);scanTimer=null;
  if(resizeWatcher){resizeWatcher.disconnect();resizeWatcher=null}
  window.removeEventListener("resize",fitGuide);
  if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  if(camera){camera.pause();camera.srcObject=null;camera=null}
  track=null;shot=null;activeHit=null;
  const oldWorker=worker;worker=null;workerPromise=null;
  if(oldWorker)oldWorker.terminate().catch(()=>{});
  panel()?.remove();
}
document.addEventListener("visibilitychange",()=>{
  if(!running||locked)return;
  if(document.hidden)clearTimeout(scanTimer);
  else{camera?.play()?.catch(()=>{});plan(250)}
});
function init(){
  if(document.querySelector("#scanLaunch"))return;
  const btn=document.createElement("button");
  btn.id="scanLaunch";btn.textContent="📷 Escanear cartas";btn.onclick=open;
  document.body.appendChild(btn);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();