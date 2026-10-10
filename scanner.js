(()=>{
"use strict";
// ORB local con indexación progresiva del catálogo y caché IndexedDB.
let camera=null,stream=null,track=null;
let recognizer=null,recognizerReady=false,recognizerGeneration=0,lastFrameAt=0,engineError="";
let visionWorker=null,visionReady=false,visionPending=false,visionCount=0,lastVisionAt=0,lastOCRAt=0,ocrPending=false,ocrHint="";
let recentVisualMatches=[],visualResults=[],ocrAttempts=0,nameHints=[];
const visionCanvas=document.createElement("canvas");
visionCanvas.width=160;visionCanvas.height=224;
const visionContext=visionCanvas.getContext("2d",{willReadFrequently:true});

let running=false,locked=false,processing=false,scanTimer=null,session=0;
let scannerHistoryActive=false;
let lastCode="",lastSeenAt=0,repeatCount=0,attempts=0,shot=null,activeHit=null;
let torch=false,facing="environment",cameraStarting=false,resizeWatcher=null,wakeLock=null;
let preferredCameraId="",availableCameras=[];
let lastScannedPrintId="";
let lastSavedScan=null,undoBusy=false;
let batchEnabled=false,batchQueue=new Map(),batchHeld="",batchBlank=0,batchLastAt=0,batchSaving=false;
const batchPriceLoads=new Map();
const $=q=>document.querySelector("#scanPanel "+q);
const panel=()=>document.querySelector("#scanPanel");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&#39;","'":"&#39;"}[c]));
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
const idBase=id=>String(baseId(id||"")).toUpperCase();
const stillActive=t=>running&&!locked&&t===session&&!!panel();
const status=msg=>{
  const e=$("#scanStatus");
  if(!e)return;
  e.textContent=msg;
  // Solo mostrar errores útiles; los contadores y estados siguen ocultos.
  const error=/^(?:Error|No se |Sin comparación visual|Elige |Introduce |Has alcanzado|Inicia sesión|La linterna|El zoom|OCR no disponible)/i.test(String(msg));
  e.classList.toggle("scan-error",error);
  e.setAttribute("aria-live",error?"assertive":"off");
};
const hint=(msg)=>{const e=$("#scanHint");if(e)e.textContent=msg};
function updateUndoButton(){
 const b=$("#scanUndo");if(!b)return;
 b.hidden=!lastSavedScan;
 if(lastSavedScan)b.textContent="↶ Deshacer "+lastSavedScan.amount+" copia(s) de "+lastSavedScan.id;
}
async function undoLastSavedScan(){
 const item=lastSavedScan;
 if(!item||undoBusy||!state.user?.id||state.user.id!==item.userId)return;
 if(qty(item.id)!==item.after){
  lastSavedScan=null;updateUndoButton();status("No se puede deshacer: la cantidad ya ha cambiado.");return;
 }
 undoBusy=true;const b=$("#scanUndo");if(b)b.disabled=true;
 try{
  const ok=await setQty(item.id,item.before);
  if(!ok){status("No se pudo deshacer en Supabase.");return}
  lastSavedScan=null;updateUndoButton();
  status("Deshecho. Restauradas "+item.before+" copias de "+item.id+".");
 }catch(e){status("No se pudo deshacer: "+e.message)}
 finally{undoBusy=false;if(b)b.disabled=false}
}
function batchTotal(){return [...batchQueue.values()].reduce((a,r)=>a+r.count,0)}
function batchUI(){
 const t=$("#scanBatchToggle"),bar=$("#scanBatchBar"),counter=$("#scanBatchCount"),hint=$("#scanBatchHint");
 if(t)t.checked=batchEnabled;
 if(bar)bar.hidden=!batchEnabled&&!batchQueue.size;
 if(counter)counter.textContent=batchTotal()+" cartas · "+batchQueue.size+" referencias";
 if(hint)hint.textContent=batchQueue.size?"Última: "+[...batchQueue.values()].at(-1).code+" · separa las cartas iguales antes de repetir":"Pasa una carta, retírala y pasa la siguiente";
}
function setBatch(enabled){
 batchEnabled=!!enabled;batchHeld="";batchBlank=0;recentVisualMatches=[];
 batchUI();
 if(!batchEnabled&&batchQueue.size)batchReview();
}
function batchCapture(c){
 const code=idBase(c.id),base=scannerBaseCard(code);
 if(!base||batchHeld===code||Date.now()-batchLastAt<650)return;
 const row=batchQueue.get(code)||{code,printId:base.id,count:0};
 row.count=Math.min(99,row.count+1);batchQueue.set(code,row);
 batchHeld=code;batchLastAt=Date.now();batchBlank=0;recentVisualMatches=[];
 batchUI();try{navigator.vibrate?.(35)}catch{}
}
function batchReview(){
 if(!running||batchSaving)return;
 locked=true;cancelAnimationFrame(scanTimer);panel()?.classList.add("locked");
 batchRender();
}
function batchOwnedText(card){
 const count=card?ownedCount(card.id):0;
 return "Ya tienes: "+count+" copia"+(count===1?"":"s");
}
function batchUnitPriceText(card,loading=false){
 const value=card?priceOf(card):null;
 return "Precio por copia: "+(value===null?(loading?"consultando…":"no disponible"):money(value));
}
async function updateBatchRowDetails(el,card){
 if(!el||!card)return;
 const owned=el.querySelector(".scanBatchOwned"),price=el.querySelector(".scanBatchPrice");
 if(owned)owned.textContent=batchOwnedText(card);
 if(!price)return;
 const value=priceOf(card);
 price.textContent=batchUnitPriceText(card,value===null);
 if(value!==null)return;
 let pending=batchPriceLoads.get(card.id);
 if(!pending){
  pending=ensurePrices([card.id]).catch(error=>console.warn("Precio escáner continuo",error))
    .finally(()=>batchPriceLoads.delete(card.id));
  batchPriceLoads.set(card.id,pending);
 }
 await pending;
 if(!running||!el.isConnected||el.querySelector(".scanBatchVariant")?.value!==card.id)return;
 price.textContent=batchUnitPriceText(card);
}
function refreshBatchOwnedCopies(changedId){
 $("#scanDecision")?.querySelectorAll(".scanBatchItem").forEach(el=>{
  const card=state.cards.find(c=>c.id===el.querySelector(".scanBatchVariant")?.value);
  if(card&&(!changedId||changedId===card.id)){
   const label=el.querySelector(".scanBatchOwned");
   if(label)label.textContent=batchOwnedText(card);
  }
 });
}
function batchRender(){
 const area=$("#scanDecision");if(!area)return;
 area.hidden=false;
 const rows=[...batchQueue.values()];
 area.innerHTML='<h3>Escaneo continuo · '+batchTotal()+' cartas</h3>'+
 '<p class="small">Aún no se ha guardado nada. Revisa la impresión exacta de cada carta. Las detectadas se presentan como base, no como paralela adivinada.</p>'+
 '<div class="scanBatchList">'+rows.map(row=>{
 const variants=cardByCode(row.code),c=variants.find(v=>v.id===row.printId)||scannerBaseCard(row.code);
 return '<div class="scanBatchItem" data-batch-code="'+esc(row.code)+'">'+(c?cardImg(c,"scanCandidateImage"):'')+
 '<div class="scanBatchInfo"><b>'+esc(c?.name||row.code)+'</b><small>'+esc(row.code)+'</small>'+
 '<select class="scanBatchVariant" aria-label="Impresión de '+esc(row.code)+'">'+variants.map(v=>
 '<option value="'+esc(v.id)+'"'+(v.id===row.printId?' selected':'')+'>'+esc(v.id)+' · '+esc(variantKindOf(v))+' · '+esc(printSetOf(v))+'</option>').join("")+'</select>'+
 '<div class="scanBatchCardMeta"><span class="scanBatchOwned">'+esc(batchOwnedText(c))+'</span>'+
 '<span class="scanBatchPrice">'+esc(batchUnitPriceText(c,!!c&&priceOf(c)===null))+'</span></div>'+
 '<div class="scanBatchEdit"><label>A añadir <input class="scanBatchQty" type="number" min="1" max="99" value="'+row.count+'"></label>'+
 '<button type="button" class="scanBatchRemove">Quitar</button></div></div></div>';
 }).join("")+'</div>'+
 '<div class="scanChoiceButtons"><button class="primary" id="scanBatchSave"'+(!rows.length?' disabled':'')+'>Guardar '+batchTotal()+' en mi colección</button></div>'+
 '<div class="scanChoiceButtons"><button id="scanBatchContinue">Seguir escaneando</button><button id="scanBatchClear"'+(!rows.length?' disabled':'')+'>Vaciar lista</button></div>';
 area.querySelectorAll("[data-batch-code]").forEach(el=>{
  const row=batchQueue.get(el.dataset.batchCode);if(!row)return;
  el.querySelector(".scanBatchVariant").onchange=e=>{
   if(cardByCode(row.code).some(c=>c.id===e.target.value))row.printId=e.target.value;
   const c=state.cards.find(c=>c.id===row.printId),img=el.querySelector("img");
   if(c&&img)img.src=imageCdnUrl(c);
   if(c)void updateBatchRowDetails(el,c);
  };
  const current=cardByCode(row.code).find(c=>c.id===row.printId);
  if(current)void updateBatchRowDetails(el,current);
  el.querySelector(".scanBatchQty").onchange=e=>{
   const q=Number(e.target.value);row.count=Number.isInteger(q)?Math.max(1,Math.min(99,q)):1;
   batchRender();batchUI();
  };
  el.querySelector(".scanBatchRemove").onclick=()=>{batchQueue.delete(row.code);batchRender();batchUI()};
 });
 $("#scanBatchSave").onclick=()=>void batchSave();
 $("#scanBatchContinue").onclick=resume;
 $("#scanBatchClear").onclick=()=>{
   if(batchQueue.size&&!confirm("¿Vaciar la lista sin guardar cartas?"))return;
   batchQueue.clear();batchRender();batchUI();
 };
}
async function batchSave(){
 if(batchSaving||!state.user?.id||!state.collectionReady||!state.sb)return;
 batchSaving=true;
 const button=$("#scanBatchSave");if(button){button.disabled=true;button.textContent="Guardando…"}
 const userId=state.user.id;let saved=0,errors=0;
 for(const [code,row] of [...batchQueue]){
  if(!running||!panel()||state.user?.id!==userId)break;
  const c=cardByCode(code).find(v=>v.id===row.printId),before=c?ownedCount(c.id):0,after=before+row.count;
  if(!c||!Number.isInteger(row.count)||row.count<1||after>99){errors++;continue}
  let ok=false;try{ok=await setQty(c.id,after)}catch(e){console.warn("Lote: error Supabase",e)}
  if(ok){
    batchQueue.delete(code);saved+=row.count;
    lastSavedScan={id:c.id,userId,before,after,amount:row.count};updateUndoButton();
  }else errors++;
 }
 batchSaving=false;batchUI();
 if(!running||!panel())return;
 if(errors){batchRender();status("Error guardando "+errors+" grupo(s). Siguen pendientes; revisa las cantidades.");return}
 resume();status("Guardadas "+saved+" cartas de tu lote.");
}

const style=document.createElement("style");style.id="scanStyles";
style.textContent=[
"#scanPanel{position:fixed;inset:0;z-index:9999;background:#080b11;color:#f6f6f6;font-family:system-ui,sans-serif;height:100vh;height:100dvh;overflow:hidden}",
"#scanPanel *{box-sizing:border-box}#scanPanel .scanLayout{position:relative;width:100%;height:100%;margin:0;padding:0;overflow:hidden}",
"#scanPanel .scanTop{position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);left:10px;right:10px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#080b11b8;border-radius:12px;padding:6px 8px}#scanPanel h2{font-size:17px;line-height:1.15;margin:0}",
"#scanPanel button{appearance:none;border:1px solid #596a84;border-radius:9px;padding:10px;background:#253145;color:#fff;font-size:13px;font-weight:750;cursor:pointer}",
"#scanPanel button:disabled{opacity:.45;cursor:default}#scanPanel .primary{background:#ffd447;color:#121212;border-color:#ffd447}",
"#scanPanel #scanHint,#scanPanel #scanIndex,#scanPanel .scanCounter,#scanPanel .scanHelp{display:none}",
"#scanPanel #scanStatus{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}",
"#scanPanel #scanStatus.scan-error{position:relative;width:auto;height:auto;min-height:20px;padding:7px 10px;margin:0;overflow:visible;clip-path:none;white-space:normal;border:1px solid #dc9c5a;border-radius:8px;font-size:12px;color:#ffe1b5;background:#322116}",
"#scanPanel .scanStage{position:absolute;inset:0;overflow:hidden;border:0;border-radius:0;background:#000}",
"#scanPanel .scanStage video,#scanPanel .scanFreeze{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}",
"#scanPanel .scanGuide{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border:2px solid #ffd447;box-shadow:0 0 0 100vmax #0006;border-radius:11px;pointer-events:none}",
"#scanPanel .scanGuide:before,#scanPanel .scanGuide:after{content:'';position:absolute;left:10%;right:10%;height:1px;background:#ffd44777}#scanPanel .scanGuide:before{top:24%}#scanPanel .scanGuide:after{bottom:18%}",
"#scanPanel .scanCounter{position:absolute;z-index:2;left:8px;top:8px;border:1px solid #fff4;border-radius:7px;background:#09111ae8;padding:6px 9px;font-size:11px;color:#e8eefb}",
"#scanPanel .scanActions{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);left:10px;right:10px;z-index:5;display:flex;gap:7px;flex-wrap:wrap;justify-content:center;background:#080b11b8;border-radius:12px;padding:6px}#scanPanel .scanActions button{flex:1;min-width:100px}",
"#scanPanel .scanTools{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);left:10px;right:10px;z-index:5;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;background:#080b11b8;border-radius:12px;padding:6px}#scanPanel .scanTools button{padding:8px 10px;font-size:12px}#scanPanel .scanTools label{font-size:12px;color:#ccd5e2;display:flex;align-items:center;gap:5px}#scanPanel .scanTools input{width:95px}#scanPanel #scanCameraSelect{width:auto;max-width:190px;min-width:130px;padding:6px;font-size:12px}",
"#scanPanel .scanDecision{position:absolute;z-index:10;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);max-height:calc(100% - env(safe-area-inset-top,0px) - 158px);overflow-y:auto;overscroll-behavior:contain;background:#0d1522fc;border:1px solid #ffd447;border-radius:13px;padding:13px 12px 18px;box-shadow:0 8px 28px #000d;touch-action:pan-y}",
"#scanPanel .scanAutoBar{position:absolute;z-index:12;top:calc(env(safe-area-inset-top,0px) + 62px);left:10px;right:10px;display:flex;flex-direction:column;gap:5px;align-items:stretch;padding:7px 10px;background:#080b11e8;border-radius:11px;border:1px solid #526279}",
"#scanPanel .scanAutoBar label{display:flex;align-items:center;justify-content:center;gap:9px;font-weight:700;font-size:13px;cursor:pointer}",
"#scanPanel #scanBatchToggle{width:19px;height:19px;accent-color:#ffd447;flex:none}",
"#scanPanel .scanOwnedLive{border:1px solid #5e855f;background:#102719;color:#d5ffdd;border-radius:9px;padding:8px 10px;font-size:14px;text-align:center;font-weight:850}",
"#scanPanel .scanOwnedLive[hidden]{display:none}",
"#scanPanel .scanCardPrice{margin:10px 0;padding:10px 12px;border:1px solid #796a37;border-radius:10px;background:#2b2514;color:#ffe18c;font-size:17px;font-weight:850;text-align:center}",
"#scanPanel.locked .scanBottomDock{display:none}",
"#scanPanel .scanDecision .scanChoiceButtons button{min-height:46px;touch-action:manipulation}",
"#scanPanel .scanDecision[hidden]{display:none}#scanPanel .scanIdentity{display:flex;align-items:flex-start;gap:9px}#scanPanel .scanIdentity img{width:72px;aspect-ratio:.716;object-fit:contain;border-radius:5px}",
"#scanPanel .scanIdentity strong{font-size:16px}#scanPanel .small{font-size:12px;color:#cad4e4}#scanPanel select,#scanPanel input[type=number],#scanPanel input[type=search]{color:#fff;background:#1d2b42;border:1px solid #68758b;border-radius:8px;padding:10px;font:inherit}",
"#scanPanel select{width:100%}#scanPanel input[type=search]{width:100%}#scanPanel .scanChoiceButtons{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:10px 0}#scanPanel .scanChoiceButtons button{flex:1}#scanPanel .scanChoiceButtons input{width:67px}",
"#scanPanel .scanSearchResults{display:grid;gap:5px;margin-top:8px}#scanPanel .scanSearchResults button{width:100%;text-align:left}#scanPanel .scanScroll{max-height:43vh;overflow-y:auto}",
"#scanPanel .scanNameChoices{display:grid;gap:6px;max-height:48vh;overflow-y:auto;margin-top:10px}#scanPanel .scanNameChoices button{display:flex;align-items:center;text-align:left;gap:10px;width:100%}#scanPanel .scanNameChoices img{width:48px;aspect-ratio:.716;object-fit:cover;border-radius:4px}#scanPanel .scanNameChoices span{display:grid;gap:3px}",
"#scanPanel .scanHelp{font-size:11px;color:#a8b6cb;text-align:center;flex:none}",
"#scanPanel .scanBatchBar{display:grid;gap:5px;background:#112332;padding:6px;border-radius:7px;font-size:12px}#scanPanel .scanBatchBar[hidden]{display:none}#scanPanel #scanBatchHint{font-size:11px;color:#bad0e0}#scanPanel #scanBatchReview{background:#ffd447;color:#131313}#scanPanel .scanBatchList{display:grid;gap:8px;max-height:43vh;overflow:auto}#scanPanel .scanBatchItem{display:flex;gap:9px;background:#182337;padding:8px;border-radius:8px}#scanPanel .scanBatchItem>img{width:56px;height:77px;object-fit:contain}#scanPanel .scanBatchInfo{flex:1;min-width:0;display:grid;gap:5px}#scanPanel .scanBatchInfo small{color:#bed0e2}#scanPanel .scanBatchInfo select{padding:6px;font-size:12px}#scanPanel .scanBatchEdit{display:flex;align-items:center;justify-content:space-between;gap:8px}#scanPanel .scanBatchEdit input{width:60px;padding:6px}",
"#scanPanel .scanBottomDock{position:absolute;z-index:8;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);display:flex;flex-direction:column;gap:6px;max-height:min(42vh,300px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}",
"#scanPanel .scanBottomDock .scanActions,#scanPanel .scanBottomDock .scanTools{position:static;inset:auto;width:100%;max-width:none;flex:none;margin:0;padding:6px;justify-content:center;align-items:center;gap:5px;background:#080b11d9}",
"#scanPanel .scanBottomDock .scanActions button{flex:1 1 29%;min-width:0;min-height:38px;padding:7px 5px;font-size:12px}#scanPanel .scanBottomDock .scanActions button[hidden],#scanPanel .scanBottomDock .scanTools button[hidden]{display:none}",
"#scanPanel .scanBottomDock .scanTools{flex-wrap:wrap}#scanPanel .scanBottomDock .scanTools label{flex:1 1 auto;min-width:0}#scanPanel .scanBottomDock .scanTools button{flex:0 0 auto}",
"#scanPanel .scanBatchCardMeta{display:flex;flex-wrap:wrap;gap:5px 12px;font-size:12px;font-weight:700;color:#e4eefe}#scanPanel .scanBatchPrice{color:#ffe18c}",
"@media (min-width:760px){#scanPanel .scanBottomDock{max-width:690px;margin:auto;max-height:33vh}#scanPanel .scanBottomDock .scanActions button{max-width:210px}}"

].join("");
document.head.appendChild(style);

function cardByCode(code){return state.cards.filter(c=>idBase(c.id)===code)}
// El escáner siempre presenta la impresión BASE si existe, incluso cuando
// la huella visual pertenece a una paralela. La identidad exacta del catálogo
// y la colección no se modifica; el usuario aún puede cambiar la impresión.
function scannerBaseCard(id){
  const code=idBase(id);
  return state.cards.find(c=>c.id===code)
    ||state.cards.find(c=>idBase(c.id)===code&&c.id===idBase(c.id))
    ||state.cards.find(c=>idBase(c.id)===code)
    ||null;
}
function matchingName(text){
  if(!text||text.length<6)return null;
  const upper=norm(text).replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ");
  const seen=new Map();
  for(const c of state.cards){
    const name=norm(c.name).replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();
    if(name.length>=4&&(" "+upper+" ").includes(" "+name+" ")&&!seen.has(idBase(c.id)))seen.set(idBase(c.id),c);
  }
  const found=[...seen.values()].sort((a,b)=>b.name.length-a.name.length);
  if(!found.length)return null;
  const length=found[0].name.length;
  return {name:found[0].name,cards:found.filter(c=>c.name.length===length).slice(0,30)};
}
function stopRecognition(){
  recognizerGeneration++;
  if(visionWorker)visionWorker.terminate();
  visionWorker=null;visionReady=false;visionPending=false;visionCount=0;
  const old=recognizer;recognizer=null;recognizerReady=false;ocrPending=false;
  if(old)void old.destroy();
}
function startRecognition(){
  stopRecognition();
  const generation=recognizerGeneration;
  visualResults=[];recentVisualMatches=[];
  const index=$("#scanIndex"),candidateBtn=$("#scanCandidates");
  if(index)index.textContent="Cargando huellas de ilustraciones…";
  if(candidateBtn){candidateBtn.hidden=true;candidateBtn.disabled=true}
  status("Arrancando comparación visual…");
  try{
    if(!window.Worker)throw Error("Este navegador no admite Web Workers");
    const worker=new Worker("/scanner-vision.js?v=visual1");
    visionWorker=worker;
    const timer=setTimeout(()=>{
      if(!running||generation!==recognizerGeneration||visionReady||visionWorker!==worker)return;
      worker.terminate();visionWorker=null;
      if(index)index.textContent="El índice visual no responde; OCR como alternativa.";
    },18000);
    worker.onmessage=({data})=>{
      if(!running||generation!==recognizerGeneration||visionWorker!==worker)return;
      if(data.type==="ready"){
        clearTimeout(timer);visionReady=true;visionCount=data.count;
        if(index)index.textContent="Índice visual listo: "+visionCount+" impresiones";
        status("Reconocimiento visual activo. Coloca la carta dentro del recuadro.");
      }else if(data.type==="result"){
        visionPending=false;handleVisualResults(data.ranked||[]);
      }else if(data.type==="frame-error"){
        visionPending=false;console.warn("Visual frame",data.message);
        if(index)index.textContent="Problema al analizar imagen: "+data.message;
      }else if(data.type==="error"){
        clearTimeout(timer);visionReady=false;visionPending=false;
        if(index)index.textContent="Índice visual no disponible: "+data.message;
        status("Sin comparación visual. OCR y búsqueda manual disponibles.");
      }
    };
    worker.onerror=event=>{
      clearTimeout(timer);visionPending=false;visionReady=false;
      if(index)index.textContent="Fallo del motor visual: "+(event?.message||"error desconocido");
    };
    worker.postMessage({type:"init"});
  }catch(error){if(index)index.textContent="Error visual: "+(error.message||error)}
  // OCR es un segundo indicio, no un requisito para usar el reconocimiento visual.
  void (async()=>{
    try{
      const mod=await import("/scanner-ocr.js?v=ocr5");
      if(!running||generation!==recognizerGeneration)return;
      const instance=mod.createEngine(message=>{
        if(generation===recognizerGeneration&&running&&!locked&&!visionReady)status(message);
      });
      recognizer=instance;
      await instance.init();
      if(!running||generation!==recognizerGeneration)return;
      recognizerReady=true;engineError="";
      if(!visionReady)status("OCR activo. Buscando el código como alternativa…");
    }catch(error){
      if(!running||generation!==recognizerGeneration)return;
      recognizerReady=false;engineError=String(error?.message||error);
      if(!visionReady)status("No se pudo cargar OCR: "+engineError);
    }
  })();
}
function cardGuideSize(previewWidth,previewHeight){
  // El marco llega de arriba abajo del vídeo visible (3 px de margen).
  // Si el sensor es más estrecho que una carta, ajustamos solo la anchura
  // para que el marco siga entero en pantalla, sin ampliar ni recortar la cámara.
  const height=Math.max(0,previewHeight-6);
  return {height,width:Math.max(0,Math.min(previewWidth-6,height*.716))};
}
function fitGuide(){
  const stage=$(".scanStage"),guide=$(".scanGuide");
  if(!stage||!guide)return;
  const w=Math.max(100,stage.clientWidth),h=Math.max(100,stage.clientHeight);
  const vw=camera?.videoWidth||0,vh=camera?.videoHeight||0;
  // Mantener el sensor completo con object-fit:contain y centrar el marco sobre el vídeo.
  const factor=vw&&vh?Math.min(w/vw,h/vh):1;
  const usableW=vw?vw*factor:w,usableH=vh?vh*factor:h;
  const {width,height}=cardGuideSize(Math.min(w,usableW),Math.min(h,usableH));
  guide.style.width=Math.round(width)+"px";guide.style.height=Math.round(height)+"px";
}
function visibleVideoBounds(){
  if(!camera||camera.readyState<2||!camera.videoWidth||!camera.videoHeight)return null;
  const r=camera.getBoundingClientRect(),w=camera.videoWidth,h=camera.videoHeight;
  if(!r.width||!r.height)return null;
  const factor=Math.min(r.width/w,r.height/h);
  const offsetX=(r.width-w*factor)/2,offsetY=(r.height-h*factor)/2;
  return {r,w,h,factor,offsetX,offsetY};
}
function snapshot(freeze=false,small=false){
  const b=visibleVideoBounds(),guide=$(".scanGuide");
  if(!b||!guide)return null;
  const g=guide.getBoundingClientRect();
  const left=Math.max(0,(g.left-b.r.left-b.offsetX)/b.factor);
  const top=Math.max(0,(g.top-b.r.top-b.offsetY)/b.factor);
  const right=Math.min(b.w,(g.right-b.r.left-b.offsetX)/b.factor),bottom=Math.min(b.h,(g.bottom-b.r.top-b.offsetY)/b.factor);
  const cropW=right-left,cropH=bottom-top;
  if(cropW<100||cropH<100)return null;
  const crop=document.createElement("canvas");
  crop.width=Math.min(small?430:1050,Math.round(cropW*1.5));
  crop.height=Math.round(crop.width*cropH/cropW);
  crop.getContext("2d").drawImage(camera,left,top,cropW,cropH,0,0,crop.width,crop.height);
  if(!freeze)return {card:crop,still:""};
  const still=document.createElement("canvas");
  still.width=Math.min(780,b.w);
  still.height=Math.max(1,Math.round(still.width*b.h/b.w));
  still.getContext("2d").drawImage(camera,0,0,b.w,b.h,0,0,still.width,still.height);
  return {card:crop,still:still.toDataURL("image/jpeg",.79)};
}
function plan(){
  cancelAnimationFrame(scanTimer);
  const tick=now=>{
    if(!running||locked||document.hidden)return;
    scanTimer=requestAnimationFrame(tick);
    if(visionReady&&!visionPending&&now-lastVisionAt>300){
      lastVisionAt=now;scanVisual();
    }
    if(recognizerReady&&!ocrPending&&now-lastOCRAt>5200){
      lastOCRAt=now;void scanOCR();
    }
  };
  scanTimer=requestAnimationFrame(tick);
}
function scanVisual(){
  if(!running||locked||!visionWorker||!visionReady||visionPending)return;
  try{
    const frame=snapshot(false,true);
    if(!frame)return;
    visionContext.drawImage(frame.card,0,0,160,224);
    const pixels=visionContext.getImageData(0,0,160,224).data;
    visionPending=true;attempts++;
    visionWorker.postMessage({type:"frame",pixels:pixels.buffer,frames:attempts,hints:ocrHint?[ocrHint,...nameHints]:nameHints},[pixels.buffer]);
    const counter=$(".scanCounter");
    if(counter)counter.textContent="Comparando arte · "+attempts+" capturas";
  }catch(error){
    visionPending=false;
    status("Error en la captura visual: "+(error?.message||error));
  }
}
function handleVisualResults(ranked){
  if(!running||locked)return;
  const known=new Map(state.cards.map(c=>[c.id,c]));
  // Varias paralelas pueden aparecer entre las primeras coincidencias:
  // mostrar una sola opción por carta y usar siempre su impresión base.
  const seenBases=new Set();
  visualResults=ranked.flatMap(match=>{
    const candidate=known.get(match.id);
    if(!candidate)return [];
    const base=known.get(idBase(candidate.id))||scannerBaseCard(candidate.id)||candidate;
    if(seenBases.has(base.id))return [];
    seenBases.add(base.id);
    return [{...match,id:base.id}];
  }).slice(0,8);
  const button=$("#scanCandidates");
  if(button){
    button.hidden=!visualResults.length;button.disabled=!visualResults.length;
    if(visualResults.length)button.textContent="Ver "+Math.min(5,visualResults.length)+" posibles cartas";
  }
  const best=visualResults[0];
  // Diez capturas consecutivas forman una ventana deslizante.
  // Las coincidencias válidas NO necesitan aparecer seguidas.
  const id=best&&best.score<=104&&best.art<=110?best.id:null;
  recentVisualMatches.push(id);
  if(recentVisualMatches.length>10)recentVisualMatches.shift();
  // El modo de lote nunca congela la cámara ni escribe en la colección.
  // Se rearma tras retirar la carta durante cinco fotogramas sin lectura.
  if(batchEnabled){
   if(!id){
    if(++batchBlank>=5&&Date.now()-batchLastAt>=800){batchHeld="";batchBlank=0;recentVisualMatches=[]}
    return;
   }
   batchBlank=0;
   if(id!==batchHeld&&recentVisualMatches.filter(x=>x===id).length>=3&&
       best.score<=92&&best.art<=101)batchCapture(known.get(id));
   return;
  }
  if(!id){
    if(attempts%4===0)status("Buscando ilustración. Alinea los cuatro bordes y evita reflejos.");
    return;
  }
  const found=recentVisualMatches.filter(value=>value===id).length;
  if(found>=3){
    const card=known.get(id),code=idBase(id);
    if(!card)return;
    shot=snapshot(true);
    show({card,code,variants:cardByCode(code),
      source:"Coincidencia visual (3 de las últimas 10 capturas)",confidence:"visual"});
  }else{
    status("Posible "+id+" · "+found+"/3 coincidencias en las últimas 10 capturas");
  }
}
async function scanOCR(){
  if(!running||locked||batchEnabled||!recognizerReady||!recognizer||ocrPending)return;
  const turn=session;
  ocrPending=true;
  try{
    const frame=snapshot(false);
    if(!frame)return;
    const result=await recognizer.recognize(frame.card,++ocrAttempts);
    if(!running||locked||turn!==session)return;
    const code=result.codes.find(id=>cardByCode(id).length);
    if(result.mode==="name"||result.mode==="full"){
      const hit=matchingName(result.text);
      if(hit){
        const matching=state.cards.filter(c=>norm(c.name)===norm(hit.name)).slice(0,180);
        nameHints=[...new Set(matching.map(c=>idBase(c.id)))];
      }
    }
    if(code){
      if(lastCode===code&&Date.now()-lastSeenAt<14000)repeatCount++;
      else repeatCount=1;
      lastCode=code;lastSeenAt=Date.now();
      if(repeatCount>=2){
        ocrHint=code;
        if(!visionReady){
          const variants=cardByCode(code);
          visualResults=variants.slice(0,8).map(c=>({id:c.id,score:0}));
          showVisualChoices("Código leído dos veces; elige la impresión correcta.");
        }
      }
    }
  }catch(error){
    if(running&&turn===session){
      engineError=String(error?.message||error);
      console.warn("OCR fallback",error);
      recognizerReady=false;
      if(!visionReady)status("Error OCR: "+engineError+". Usa la búsqueda manual.");
    }
  }finally{ocrPending=false}
}
function showVisualChoices(heading="Posibles cartas según la ilustración"){
  if(!running||!visualResults.length)return;
  if(batchEnabled){batchReview();return}
  updateScanCopiesLabel(null);
  locked=true;cancelAnimationFrame(scanTimer);
  shot=snapshot(true);
  panel()?.classList.add("locked");
  if(shot?.still){
    const still=document.createElement("img");still.className="scanFreeze";still.src=shot.still;
    $(".scanFreeze")?.remove();$(".scanStage").prepend(still);
  }
  if(camera)camera.style.visibility="hidden";
  const entries=visualResults.slice(0,8).map(item=>({item,c:state.cards.find(c=>c.id===item.id)})).filter(x=>x.c);
  const area=$("#scanDecision");area.hidden=false;
  area.innerHTML='<strong>'+esc(heading)+'</strong>'+
    '<p class="small">Compara cada imagen y confirma la impresión exacta. El sistema nunca añade cartas por sí solo.</p>'+
    '<div class="scanNameChoices">'+entries.map(({c})=>
      '<button type="button" data-scan-print="'+esc(c.id)+'">'+cardImg(c,"scanCandidateImage")+
      '<span><b>'+esc(c.name)+'</b><small>'+esc(c.id)+' · '+esc(printSetOf(c))+
      '</small></span></button>').join("")+'</div>'+
    '<div class="scanChoiceButtons"><button id="scanBackVisual">Volver a escanear</button></div>';
  area.querySelectorAll("[data-scan-print]").forEach(button=>button.onclick=()=>{
    const chosen=state.cards.find(c=>c.id===button.dataset.scanPrint);
    if(!chosen)return;
    releaseFreeze();
    show({card:chosen,code:idBase(chosen.id),variants:cardByCode(idBase(chosen.id)),
      selectedId:scannerBaseCard(chosen.id)?.id||chosen.id,source:"Elegida de los resultados visuales",confidence:"manual"});
  });
  $("#scanBackVisual").onclick=resume;
  status("Selecciona la impresión que se corresponde con tu carta.");
}
function ownedCount(id){return Number(qty(id)||0)}
function updateScanCopiesLabel(card){
 const count=card?ownedCount(card.id):null;
 const add=$("#scanAddOne");
 if(add)add.textContent=card?"+1 y continuar · Ya tienes "+count:"+1 y continuar";
}
// Actualizar la ficha y el contador persistente sin reiniciar el escáner.
function refreshScannerCopies(changedId){
  if(!running||!panel())return;
  const selectedId=$("#scanVariant")?.value||lastScannedPrintId;
  if(!selectedId||(changedId&&changedId!==selectedId))return;
  const current=state.cards.find(c=>c.id===selectedId);
  if(!current)return;
  const count=ownedCount(current.id);
  const live=$("#scanOwnedLive");
  if(live){
    live.hidden=false;
    live.textContent=current.name+" · "+current.id+" · Tienes "+count+" copia"+(count===1?"":"s");
  }
  if($("#scanVariant")?.value!==current.id)return;
  updateScanCopiesLabel(current);
  const exact=$("#scanExactCount");
  if(exact)exact.textContent="Tienes "+count+" copia"+(count===1?"":"s")+" de esta impresión.";
  const group=$("#scanGroupCount");
  if(group){
    const total=cardByCode(idBase(current.id)).reduce((sum,c)=>sum+ownedCount(c.id),0);
    group.textContent="Tienes "+total+" copias de esta carta · "+Math.max(0,playsetTarget(current)-total)+" para el playset";
  }
}
async function updateScannerPrice(card){
  const label=$("#scanCardPrice");
  if(!label)return;
  if(!card){label.textContent="Elige una impresión para ver el precio.";return}
  const id=card.id;
  const display=()=>{
    const value=priceOf(card);
    label.textContent=value===null?"Precio de esta impresión: no disponible":
      "Precio de esta impresión: "+money(value);
    return value;
  };
  if(display()!==null)return;
  label.textContent="Consultando precio de esta impresión…";
  try{await ensurePrices([id])}
  catch(error){console.warn("No se pudo consultar el precio exacto del escáner",error)}
  // No mostrar el precio de otra versión si el usuario ha cambiado de impresión.
  if(!running||$("#scanCardPrice")!==label||$("#scanVariant")?.value!==id)return;
  display();
}
function chooseVariant(variants,selected){
  const selection=$("#scanVariant");
  if(!selection)return;
  const current=variants.find(c=>c.id===selection.value);
  const pic=$("#scanFoundImage"),count=$("#scanExactCount");
  updateScanCopiesLabel(current);
  void updateScannerPrice(current);
  if(count)count.textContent=current?"Tienes "+ownedCount(current.id)+" copias de esta impresión.":"Selecciona una impresión exacta para guardarla.";
  lastScannedPrintId=current?.id||"";
  if(current)refreshScannerCopies();
  if(pic&&current){
    pic.dataset.imageOfficial=officialImageUrl(current);
    pic.dataset.imageFallback=fallbackImageUrl(current);
    pic.dataset.imageRecovery="0";
    pic.dataset.imageStep="0";
    pic.src=imageCdnUrl(current);
    pic.onerror=()=>{
      const step=Number(pic.dataset.imageStep||0);
      if(step===0){pic.dataset.imageStep="1";pic.src=pic.dataset.imageOfficial}
      else if(step===1){pic.dataset.imageStep="2";pic.src=pic.dataset.imageFallback}
      else pic.onerror=null;
    };
  }
}
function showNameChoices(hit){
  if(!running||!hit?.cards?.length)return;
  updateScanCopiesLabel(null);
  locked=true;cancelAnimationFrame(scanTimer);
  panel()?.classList.add("locked");
  const still=document.createElement("img");still.className="scanFreeze";still.src=shot?.still||"";
  $(".scanFreeze")?.remove();$(".scanStage").prepend(still);
  if(camera)camera.style.visibility="hidden";
  const area=$("#scanDecision");area.hidden=false;
  area.innerHTML='<strong>Nombre leído: '+esc(hit.name)+'</strong>'+
    '<p class="small">Distintas cartas pueden compartir nombre. No he podido leer el número; elige el código de tu carta o enfoca la esquina inferior derecha.</p>'+
    '<div class="scanNameChoices">'+hit.cards.map(c=>
      '<button type="button" data-scan-choose="'+esc(idBase(c.id))+'">'+
      cardImg(c,"scanCandidateImage")+'<span><b>'+esc(idBase(c.id))+'</b><small>'+esc(c.name)+' · '+esc(c.set||"")+'</small></span></button>'
    ).join("")+'</div>'+
    '<div class="scanChoiceButtons"><button type="button" id="scanTryCode">Volver a leer el número</button></div>';
  area.querySelectorAll("[data-scan-choose]").forEach(b=>b.onclick=()=>{
    const code=b.dataset.scanChoose,variants=cardByCode(code);
    if(!variants.length)return;
    releaseFreeze();
    show({card:variants.find(v=>idBase(v.id)===v.id)||variants[0],code,variants,source:"Elegido por ti",confidence:"manual"});
  });
  $("#scanTryCode").onclick=resume;
  status("Solo se ha leído el nombre: selecciona el código correcto. Nada se guarda automáticamente.");
}
function show(hit){
  if(!running||!hit?.card)return;
  
  // La búsqueda manual respeta la versión elegida expresamente;
  // todos los reconocimientos automáticos y candidatos visuales van a BASE.
  const isManualSearch=hit.source==="Búsqueda manual";
  const base=isManualSearch?hit.card:(scannerBaseCard(hit.code||hit.card.id)||hit.card);
  hit={...hit,card:base,selectedId:isManualSearch?(hit.selectedId||hit.card.id):base.id};
  locked=true;cancelAnimationFrame(scanTimer);
  const p=panel();p?.classList.add("locked");
  const videoStill=document.createElement("img");
  videoStill.className="scanFreeze";videoStill.src=shot?.still||"";
  if(shot?.still){$(".scanFreeze")?.remove();$(".scanStage").prepend(videoStill)}
  if(camera)camera.style.visibility="hidden";
  const variants=hit.variants||cardByCode(hit.code);
  const owned=variants.reduce((total,c)=>total+ownedCount(c.id),0);
  const limit=playsetTarget(hit.card);
  const options='<option value="">Elige la impresión exacta…</option>'+variants.map(c=>
    '<option value="'+esc(c.id)+'"'+(hit.selectedId===c.id||variants.length===1?' selected':'')+'>'+esc(c.id)+" · "+esc(variantKindOf(c))+" · "+esc(printSetOf(c))+'</option>'
  ).join("");
  const area=$("#scanDecision");area.hidden=false;
  area.innerHTML='<div class="scanIdentity">'+
    '<img id="scanFoundImage" src="'+esc(imageCdnUrl(hit.card))+'" data-image-official="'+esc(officialImageUrl(hit.card))+'" data-image-fallback="'+esc(fallbackImageUrl(hit.card))+'" alt="Carta reconocida">'+
    '<div><strong>'+esc(hit.card.name)+'</strong><div class="small">'+esc(hit.code)+' · '+esc(hit.source)+'</div>'+
    '<div class="small" id="scanGroupCount">Tienes '+owned+' copias de esta carta · '+Math.max(0,limit-owned)+' para el playset</div></div></div>'+
    '<div class="scanCardPrice" id="scanCardPrice" aria-live="polite">Consultando precio…</div>'+
    '<p class="small">Confirma la impresión. Las paralelas y reimpresiones comparten código y no son intercambiables.</p>'+
    '<select id="scanVariant">'+options+'</select><div id="scanExactCount" class="small"></div>'+
    '<div class="scanChoiceButtons"><button class="primary" id="scanAddOne">+1 y continuar</button>'+
    '<input type="number" min="1" max="99" value="2" id="scanQuantity" aria-label="Número de copias">'+
    '<button class="primary" id="scanAddMany">Añadir y continuar</button></div>'+
    '<div class="scanChoiceButtons"><button id="scanDiscard">Descartar y seguir</button><button id="scanSearchAgain">Buscar otra carta</button></div>';
  const selected=()=>variants.find(c=>c.id===$("#scanVariant")?.value);
  $("#scanVariant").onchange=()=>{
     chooseVariant(variants);
  };
  chooseVariant(variants);
  let saving=false;
  const save=async howMany=>{
    if(saving)return;
    
    if(!state.user||!state.collectionReady||!state.sb){
      status("Inicia sesión para guardar en la colección.");return;
    }
    const card=selected(),amount=Number(howMany);
    if(!card){status("Elige la impresión exacta antes de añadir.");return}
    if(!Number.isInteger(amount)||amount<1||amount>99){status("Introduce entre 1 y 99 copias.");return}
    const before=ownedCount(card.id),after=Math.min(99,before+amount);
    if(after===before){status("Has alcanzado el límite de copias.");return}
    saving=true;
    const one=$("#scanAddOne"),many=$("#scanAddMany");one.disabled=many.disabled=true;
    status("Guardando la impresión exacta en Supabase…");
    let ok=false;
    try{ok=await setQty(card.id,after)}
    catch(error){console.warn("Error guardando desde el escáner",error)}
    finally{saving=false}
    if(!running||!panel())return;
    one.disabled=many.disabled=false;
    if(!ok){status("No se ha confirmado el guardado en Supabase. No se ha añadido.");return}
    lastSavedScan={id:card.id,userId:state.user.id,before,after,amount:after-before};
    updateUndoButton();
    resume();
    status("Guardadas "+(after-before)+" copia(s) de "+card.id+". Escaneando de nuevo.");
  };
  $("#scanAddOne").onclick=()=>void save(1);
  $("#scanAddMany").onclick=()=>void save($("#scanQuantity").value);
  $("#scanDiscard").onclick=resume;
  $("#scanSearchAgain").onclick=manual;
  status("Carta detectada. Comprueba la versión antes de guardar.");
}
function releaseFreeze(){
  updateScanCopiesLabel(null);
  locked=false;panel()?.classList.remove("locked");
  $(".scanFreeze")?.remove();if(camera)camera.style.visibility="";
  const area=$("#scanDecision");if(area){area.hidden=true;area.replaceChildren()}
}
function resume(){
  if(!running)return;
  session++;lastCode="";repeatCount=0;lastSeenAt=0;shot=null;activeHit=null;
  releaseFreeze();
  visualResults=[];recentVisualMatches=[];ocrHint="";nameHints=[];
  status(visionReady?"Comparando ilustraciones…":"Preparando reconocimiento…");plan();
}
function manual(){
  if(!running)return;
  
  session++;locked=true;cancelAnimationFrame(scanTimer);
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
      shot=snapshot(true);
      activeHit={card:c,code:idBase(c.id),variants:group,source:"Búsqueda manual",confidence:"manual"};
      // The selected manual printing is honoured instead of guessing its base.
      show(activeHit);
      const chooser=$("#scanVariant");
      if(chooser){chooser.value=c.id;chooseVariant(group)}
    });
  };
  $("#scanSearch").focus();status("Búsqueda manual · no se guarda nada sin confirmación.");
}
async function updateCameraControls(){
  const t=track,cap=t?.getCapabilities?.()||{};
  const torchButton=$("#scanTorch"),zoomControl=$("#scanZoom"),zoomWrap=$("#scanZoomWrap");
  torch=false;
  if(torchButton){torchButton.hidden=!cap.torch;torchButton.textContent="Linterna";torchButton.disabled=false}
  if(zoomWrap)zoomWrap.hidden=!(cap.zoom&&Number.isFinite(cap.zoom.min)&&Number.isFinite(cap.zoom.max)&&cap.zoom.max>cap.zoom.min);
  if(zoomControl&&cap.zoom){
    zoomControl.min=String(cap.zoom.min);zoomControl.max=String(cap.zoom.max);
    zoomControl.step=String(cap.zoom.step||.1);
    zoomControl.value=String(cap.zoom.min);
  }
  if(cap.focusMode?.includes?.("continuous")){
    try{await t.applyConstraints({advanced:[{focusMode:"continuous"}]})}catch{}
  }
  // The browser may start on a previously saved digital zoom. Reset the physical track
  // to its lowest supported zoom on every camera open and camera flip.
  if(cap.zoom&&Number.isFinite(cap.zoom.min)){
    try{await t.applyConstraints({advanced:[{zoom:cap.zoom.min}]})}catch{if(zoomWrap)zoomWrap.hidden=true}
    if(zoomControl)zoomControl.value=String(t.getSettings?.().zoom??cap.zoom.min);
  }
}
// Device labels are available only after camera permission. Prefer a real rear
// wide-angle device over a telephoto/macro lens when the browser exposes one.
const frontLabel=label=>/(?:front|frontal|selfie|facetime|user facing)/i.test(label);
const rearLabel=label=>/(?:back|rear|environment|trasera|posterior|gran angular|wide|macro|telephoto)/i.test(label);
function cameraPriority(device){
  const label=String(device.label||"");
  if(frontLabel(label))return -1000;
  if(/(?:macro|telephoto|teleobjetivo|tele\b|telefoto|\bzoom\b)/i.test(label))return -100;
  if(/(?:ultra[ -]?wide|ultra[ -]?gran angular|0[.,]5\s*x)/i.test(label))return 150;
  if(/(?:wide|gran angular|0[.,]6\s*x)/i.test(label))return 90;
  return rearLabel(label)?25:0;
}
function camerasForFacing(devices){
  const videos=devices.filter(d=>d.kind==="videoinput"&&d.deviceId);
  if(facing==="user")return videos.filter(d=>frontLabel(d.label));
  const rear=videos.filter(d=>rearLabel(d.label)&&!frontLabel(d.label));
  return rear.length?rear:videos.filter(d=>!frontLabel(d.label));
}
function showCameraOptions(activeId){
  const wrap=$("#scanCameraWrap"),select=$("#scanCameraSelect");
  if(!wrap||!select)return;
  select.replaceChildren();
  const automatic=document.createElement("option");
  automatic.value="";automatic.textContent="Automática";
  select.appendChild(automatic);
  availableCameras.forEach((device,i)=>{
    const option=document.createElement("option");
    option.value=device.deviceId;
    const isWide=cameraPriority(device)>=90;
    option.textContent=(isWide?"Gran angular · ":"")+(device.label||"Cámara "+(i+1));
    select.appendChild(option);
  });
  wrap.hidden=availableCameras.length<2;
  const current=availableCameras.find(d=>d.deviceId===activeId);
  if(current)select.value=current.deviceId;
}
async function restartCamera(turn){
  cancelAnimationFrame(scanTimer);releaseFreeze();
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  track=null;if(camera)camera.srcObject=null;
  await startCamera(turn);
}
async function startCamera(turn){
  if(cameraStarting)return;
  cameraStarting=true;
  status("Abriendo cámara…");
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error("Tu navegador no permite acceder a la cámara");
    const videoSettings={width:{ideal:1280},height:{ideal:1920},frameRate:{ideal:24}};
    const initialVideo=preferredCameraId
      ?{...videoSettings,deviceId:{exact:preferredCameraId}}
      :{...videoSettings,facingMode:{ideal:facing}};
    let media;
    try{
      media=await navigator.mediaDevices.getUserMedia({audio:false,video:initialVideo});
    }catch(e){
      if(preferredCameraId||e.name==="OverconstrainedError"||e.name==="NotFoundError"){
        preferredCameraId="";
        media=await navigator.mediaDevices.getUserMedia({audio:false,video:{...videoSettings,facingMode:{ideal:facing}}})
          .catch(()=>navigator.mediaDevices.getUserMedia({audio:false,video:true}));
      }else throw e;
    }
    if(turn!==session||!running){media.getTracks().forEach(t=>t.stop());return}
    let devices=[];
    try{devices=await navigator.mediaDevices.enumerateDevices()}
    catch(error){console.warn("No se pudieron enumerar las cámaras",error)}
    if(turn!==session||!running){media.getTracks().forEach(t=>t.stop());return}
    availableCameras=camerasForFacing(devices);
    // Only auto-switch to an explicitly identified wide-angle camera.
    const wide=availableCameras.slice().sort((a,b)=>cameraPriority(b)-cameraPriority(a))[0];
    const activeId=media.getVideoTracks()[0]?.getSettings?.().deviceId;
    const targetId=preferredCameraId||(facing==="environment"&&wide&&cameraPriority(wide)>=90?wide.deviceId:"");
    if(targetId&&targetId!==activeId){
      media.getTracks().forEach(t=>t.stop());
      try{
        media=await navigator.mediaDevices.getUserMedia({audio:false,video:{...videoSettings,deviceId:{exact:targetId}}});
      }catch(error){
        console.warn("No se pudo seleccionar la cámara gran angular",error);
        preferredCameraId="";
        // A failed explicit selection should not leave the scanner with a stopped stream.
        media=await navigator.mediaDevices.getUserMedia({audio:false,video:{...videoSettings,facingMode:{ideal:facing}}})
          .catch(()=>navigator.mediaDevices.getUserMedia({audio:false,video:true}));
      }
    }
    if(turn!==session||!running){media.getTracks().forEach(t=>t.stop());return}
    stream=media;track=media.getVideoTracks()[0]||null;
    camera.srcObject=media;
    camera.muted=true;camera.setAttribute("playsinline","");
    await camera.play();
    if(turn!==session||!running)return;
    showCameraOptions(track?.getSettings?.().deviceId||"");
    await updateCameraControls();
    if(turn!==session||!running)return;
    fitGuide();
    status("Cámara activa. Iniciando comparación de ilustraciones…");
    hint("Reconocimiento de ilustraciones + OCR auxiliar · sin pago");
    plan();
    if(navigator.wakeLock?.request)navigator.wakeLock.request("screen").then(lock=>{if(running)wakeLock=lock;else lock.release()}).catch(()=>{});
  }catch(e){
    if(turn===session&&running)status("No se pudo abrir la cámara: "+(e.message||e)+". Revisa los permisos.");
  }finally{cameraStarting=false}
}
async function switchCamera(){
  if(!running)return;
  const turn=++session;
  facing=facing==="environment"?"user":"environment";
  preferredCameraId="";availableCameras=[];
  await restartCamera(turn);
}
async function selectCamera(deviceId){
  if(!running||deviceId===track?.getSettings?.().deviceId)return;
  preferredCameraId=deviceId;
  await restartCamera(++session);
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
  const range=track.getCapabilities?.().zoom;
  const requested=Number(value);
  if(!Number.isFinite(requested)||!range)return;
  const clamped=Math.max(range.min,Math.min(range.max,requested));
  try{
    await track.applyConstraints({advanced:[{zoom:clamped}]});
    const slider=$("#scanZoom");if(slider)slider.value=String(track.getSettings?.().zoom??clamped);
    fitGuide();
  }catch{status("El zoom no está disponible con esta cámara.")}
}
async function open(){
  if(panel())return;
  if(!state.user||!state.collectionReady||!state.sb){
    alert("Debes iniciar sesión y cargar tu colección de Supabase para escanear cartas.");return;
  }
  if(!state.cards?.length){alert("El catálogo aún no ha terminado de cargar.");return}
  running=true;locked=false;processing=false;attempts=0;lastCode="";repeatCount=0;session++;
  batchEnabled=false;batchQueue.clear();batchHeld="";batchBlank=0;batchLastAt=0;
  lastScannedPrintId="";lastSavedScan=null;
  const turn=session;
  const p=document.createElement("section");p.id="scanPanel";
  p.innerHTML='<div class="scanLayout">'+
    '<div class="scanTop"><h2>Escáner visual · One Piece</h2><button id="scanClose">✕ Cerrar</button></div>'+
    '<div class="scanAutoBar"><label><input type="checkbox" id="scanBatchToggle"> Escaneo continuo · varias cartas sin detenerse</label>'+ 
    '<div class="scanBatchBar" id="scanBatchBar" hidden><b id="scanBatchCount">0 cartas</b><span id="scanBatchHint"></span><button id="scanBatchReview" type="button">Revisar y guardar</button></div>'+ 
    '<div class="scanOwnedLive" id="scanOwnedLive" role="status" aria-live="polite" hidden></div></div>'+
    '<div id="scanStatus" role="status" aria-live="off"></div>'+
    '<div id="scanHint">Ilustraciones + OCR auxiliar · sin servicios de pago</div>'+
    '<div id="scanIndex" class="small">Cargando índice visual…</div>'+
    '<div class="scanStage"><video muted playsinline autoplay></video><div class="scanGuide"></div>'+
    '<div class="scanCounter">Escaneo continuo</div><div class="scanDecision" id="scanDecision" hidden></div></div>'+
    '<div class="scanBottomDock"><div class="scanTools"><button id="scanTorch" hidden>Linterna</button>'+
    '<label id="scanZoomWrap" hidden>Zoom <input id="scanZoom" type="range" min="1" max="2" step=".1"></label>'+
    '<label id="scanCameraWrap" hidden>Cámara <select id="scanCameraSelect" aria-label="Elegir lente de cámara"></select></label>'+
    '<button id="scanFlip">Cambiar cámara</button></div>'+
    '<div class="scanActions">'+
    '<button id="scanCandidates" hidden disabled>Ver posibles cartas</button><button id="scanRetry">Reiniciar motores</button><button id="scanResume">Continuar</button>'+
    '<button id="scanManual">Buscar manualmente</button><button id="scanUndo" hidden>↶ Deshacer</button></div></div>'+
    '<div class="scanHelp">Llena el recuadro con la carta y evita reflejos. Confirma siempre la impresión.</div>'+
    '</div>';
  document.body.appendChild(p);
  camera=$(".scanStage video");
  $("#scanClose").onclick=()=>close();
  $("#scanBatchToggle").onchange=e=>setBatch(e.target.checked);
  $("#scanBatchReview").onclick=batchReview;
  batchUI();
  $("#scanResume").onclick=resume;
  $("#scanCandidates").onclick=()=>showVisualChoices();
  $("#scanRetry").onclick=()=>{if(running)void startRecognition()};
  $("#scanManual").onclick=manual;
  $("#scanUndo").onclick=()=>void undoLastSavedScan();
  $("#scanTorch").onclick=toggleTorch;
  $("#scanFlip").onclick=switchCamera;
  $("#scanCameraSelect").onchange=e=>selectCamera(e.target.value);
  $("#scanZoom").oninput=e=>zoomCamera(e.target.value);
  if("ResizeObserver" in window){
    resizeWatcher=new ResizeObserver(fitGuide);resizeWatcher.observe($(".scanStage"));
  }else window.addEventListener("resize",fitGuide);
  // Una entrada temporal para que Atrás en Android cierre el escáner
  // manteniendo la página, pestaña y detalle originales.
  const previousHistory=history.state&&typeof history.state==="object"?history.state:{};
  try{
    history.pushState({...previousHistory,mialbumScanner:true},"",location.href);
    scannerHistoryActive=true;
  }catch(error){
    console.warn("No se pudo registrar historial del escáner",error);
  }
  fitGuide();await startCamera(turn);
  if(running&&panel())void startRecognition();
}
function close({fromHistory=false}={}){
  if(!running&&!panel())return;
  if(!fromHistory&&scannerHistoryActive){
    history.back();
    return;
  }
  scannerHistoryActive=false;
  lastScannedPrintId="";lastSavedScan=null;
  batchEnabled=false;batchQueue.clear();batchHeld="";batchBlank=0;
  running=false;locked=false;session++;
  cancelAnimationFrame(scanTimer);scanTimer=null;
  if(resizeWatcher){resizeWatcher.disconnect();resizeWatcher=null}
  window.removeEventListener("resize",fitGuide);
  if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  if(camera){camera.pause();camera.srcObject=null;camera=null}
  track=null;shot=null;activeHit=null;
  stopRecognition();
  panel()?.remove();
}
// Captura el Atrás antes de que la navegación del álbum cambie de vista.
window.addEventListener("popstate",event=>{
  if(!scannerHistoryActive||!panel())return;
  event.stopImmediatePropagation();
  close({fromHistory:true});
},true);
document.addEventListener("visibilitychange",()=>{
  if(!running)return;
  if(document.hidden){
    if(!locked)cancelAnimationFrame(scanTimer);
  }else if(!locked){
    camera?.play()?.catch(()=>{});plan();
  }
});
// Aceptar únicamente cambios ya confirmados por la colección de esta sesión.
window.addEventListener("mialbum:collection-updated",event=>{
  const detail=event.detail||{};
  if(!state.user?.id||detail.userId!==state.user.id)return;
  refreshScannerCopies(detail.id);
  refreshBatchOwnedCopies(detail.id);
});
window.openOnePieceScanner=open;

})();