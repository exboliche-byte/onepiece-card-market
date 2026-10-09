/* Photo multi-scan: local image processing; no photos are uploaded to a server. */
(()=>{
"use strict";
const $=q=>document.querySelector("#photoScanPanel "+q);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&#39;","'":"&#39;"}[c]));
const base=id=>String(baseId(id||"")).toUpperCase();
const MAX_FILE=22*1024*1024, MAX_CARDS=40;
let canvas=null,regions=[],rows=[],worker=null,workerReady=false,matcher=null,active=false,busy=false,generation=0,drag=null;
let detectWorker=null,detectPending=null,photoOcr=null,photoOcrLoading=null;
const cardCode=c=>base(c?.id);
function baseCard(id){const code=base(id);return state.cards.find(c=>c.id===code)||state.cards.find(c=>cardCode(c)===code)||null}
function group(code){return state.cards.filter(c=>cardCode(c)===code)}
function tell(s,error=false){const x=$("#photoStatus");if(x){x.textContent=s;x.classList.toggle("photo-error",error)}}
function makeCrop(region,source=canvas,width=160,height=224,extraRotation=0){
 const out=document.createElement("canvas");out.width=width;out.height=height;
 const c=out.getContext("2d",{willReadFrequently:true});
 c.fillStyle="#fff";c.fillRect(0,0,width,height);
 c.translate(width/2,height/2);
 c.rotate(extraRotation);
 c.scale(width/region.w,height/region.h);
 c.rotate(-(region.angle||0));
 c.translate(-region.cx,-region.cy);
 c.drawImage(source,0,0);
 return out;
}
function normalizeImage(file){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
   try{
    const w=img.naturalWidth,h=img.naturalHeight;
    if(!w||!h||w*h>75000000)throw Error("Imagen demasiado grande o dañada.");
    const scale=Math.min(1,1900/Math.max(w,h));
    const out=document.createElement("canvas");out.width=Math.round(w*scale);out.height=Math.round(h*scale);
    out.getContext("2d",{willReadFrequently:true}).drawImage(img,0,0,out.width,out.height);
    resolve(out);
   }catch(e){reject(e)}finally{URL.revokeObjectURL(url)}
  };
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("No se puede abrir la imagen."))};
  img.src=url;
 });
}
function stopDetection(){
 if(detectWorker){detectWorker.terminate();detectWorker=null}
 if(detectPending){const job=detectPending;detectPending=null;clearTimeout(job.timer);job.reject(Error("Detección cancelada"))}
}
function detectionRegions(source){
 const scale=Math.min(1,780/Math.max(source.width,source.height));
 const working=document.createElement("canvas");
 working.width=Math.max(1,Math.round(source.width*scale));
 working.height=Math.max(1,Math.round(source.height*scale));
 const ctx=working.getContext("2d",{willReadFrequently:true});
 ctx.drawImage(source,0,0,working.width,working.height);
 const pixels=ctx.getImageData(0,0,working.width,working.height).data;
 const sx=source.width/working.width,sy=source.height/working.height;
 return new Promise((resolve,reject)=>{
  let worker;
  try{worker=new Worker("/photo-detector.js?v=2")}catch(error){reject(error);return}
  detectWorker=worker;
  const timer=setTimeout(()=>{
   if(detectWorker===worker){detectWorker=null;detectPending=null;worker.terminate()}
   reject(Error("La detección ha tardado demasiado; marca los recuadros manualmente."));
  },14000);
  detectPending={timer,reject};
  worker.onmessage=({data})=>{
   if(detectWorker!==worker)return;
   detectWorker=null;detectPending=null;clearTimeout(timer);worker.terminate();
   if(data.type==="error"){reject(Error(data.message));return}
   if(data.type!=="detected"){reject(Error("Respuesta del detector no válida"));return}
   resolve((data.regions||[]).map(r=>({cx:r.cx*sx,cy:r.cy*sy,w:r.w*sx,h:r.h*sy,angle:r.angle,manual:false})));
  };
  worker.onerror=()=>{
   if(detectWorker!==worker)return;
   detectWorker=null;detectPending=null;clearTimeout(timer);worker.terminate();
   reject(Error("El detector no está disponible."));
  };
  worker.postMessage({type:"detect",requestId:1,width:working.width,height:working.height,pixels:pixels.buffer},[pixels.buffer]);
 });
}
function layoutRegions(count,source=canvas){
 if(!source||!Number.isInteger(count)||count<1||count>MAX_CARDS)return [];
 const landscape=source.width>=source.height;
 const columns=count===1?1:count===2?(landscape?2:1):count===3?(landscape?3:1):
   count===4?2:count===6?(landscape?3:2):count===9?3:Math.ceil(Math.sqrt(count*source.width/source.height));
 const rowsCount=Math.ceil(count/columns);
 const cellW=source.width/columns,cellH=source.height/rowsCount;
 const regions=[];
 for(let n=0;n<count;n++){
  const x=n%columns,y=Math.floor(n/columns);
  const w=Math.min(cellW*.95,cellH*.95*.716),h=w/.716;
  regions.push({cx:(x+.5)*cellW,cy:(y+.5)*cellH,w,h,angle:0,manual:true});
 }
 return regions;
}
function photoLayoutOptions(){
 return [[0,"Detección automática"],[1,"Una carta"],[2,"2 cartas"],[3,"3 cartas"],[4,"4 cartas (2 × 2)"],[6,"6 cartas"],[9,"9 cartas (3 × 3)"],[12,"12 cartas"]];
}
function workerStop(){if(worker)worker.terminate();worker=null;workerReady=false;if(matcher){const job=matcher;matcher=null;clearTimeout(job.timer);job.reject(Error("Escaneo interrumpido"))}}
function workerStart(){
 workerStop();
 return new Promise((resolve,reject)=>{
  const gen=generation;let completed=false;
  const task=new Worker("/scanner-vision.js?v=visual1");worker=task;
  const timeout=setTimeout(()=>{if(!completed){completed=true;reject(Error("No se pudo cargar el catálogo visual"));workerStop()}},20000);
  task.onmessage=({data})=>{
   if(gen!==generation||!active||worker!==task)return;
   if(data.type==="ready"){workerReady=true;if(!completed){completed=true;clearTimeout(timeout);resolve()}}
   else if(data.type==="error"){if(!completed){completed=true;clearTimeout(timeout);reject(Error(data.message))}else tell("Error visual: "+data.message,true)}
   else if(data.type==="result"&&matcher){const p=matcher;matcher=null;clearTimeout(p.timer);p.resolve(data.ranked||[])}
   else if(data.type==="frame-error"&&matcher){const p=matcher;matcher=null;clearTimeout(p.timer);p.reject(Error(data.message))}
  };
  task.onerror=()=>{if(!completed){completed=true;clearTimeout(timeout);reject(Error("Motor visual no disponible."))}};
  task.postMessage({type:"init"});
 });
}
function recognizeFrame(region,rotation=0){
 if(!workerReady||!worker)return Promise.reject(Error("Motor visual no disponible"));
 const crop=makeCrop(region,canvas,160,224,rotation);
 const data=crop.getContext("2d",{willReadFrequently:true}).getImageData(0,0,160,224).data;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{matcher=null;reject(Error("Análisis visual agotó el tiempo"))},14000);
  matcher={resolve,reject,timer};
  worker.postMessage({type:"frame",frames:1,pixels:data.buffer,limit:32,photo:true},[data.buffer]);
 });
}
async function recognize(region){
 const normal=await recognizeFrame(region);
 if(normal[0]&&normal[0].score<=58&&normal[0].art<=82)return normal;
 const reversed=await recognizeFrame(region,Math.PI);
 let best=reversed[0]&&reversed[0].score+4<(normal[0]?.score??999)?reversed:normal;
 if((best[0]?.score??999)>78){
  const tighter={...region,w:region.w*.91,h:region.h*.91};
  const retry=await recognizeFrame(tighter);
  if(retry[0]&&retry[0].score+3<(best[0]?.score??999))best=retry;
 }
 return best;
}
function baseSuggestions(ranked){
 const found=new Set(),options=[];
 for(const candidate of ranked||[]){
  const code=base(candidate.id),card=baseCard(code);
  if(!card||!code||found.has(code))continue;
  found.add(code);options.push({code,score:candidate.score,art:candidate.art});
  if(options.length>=9)break;
 }
 return options;
}
function selectedRow(region,ranked=[]){
 const options=baseSuggestions(ranked),first=options[0],second=options[1];
 const confident=!!first&&first.score<=80&&first.art<=95&&(first.score<=59||!second||second.score-first.score>=5);
 const selectedCode=confident?first.code:"";
 return {region,thumb:makeCrop(region,canvas,110,154).toDataURL("image/jpeg",.78),
   candidates:options,selectedCode,printId:selectedCode?(baseCard(selectedCode)?.id||""):"",
   confident,omitted:false,count:1};
}
function drawPreview(){
 const preview=$("#photoPreview");
 if(!preview||!canvas)return;
 const scale=Math.min(1,1120/Math.max(canvas.width,canvas.height));
 const w=Math.max(1,Math.round(canvas.width*scale)),h=Math.max(1,Math.round(canvas.height*scale));
 if(preview.width!==w||preview.height!==h){preview.width=w;preview.height=h}
 const ctx=preview.getContext("2d");
 ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(w/canvas.width,h/canvas.height);
 ctx.drawImage(canvas,0,0);
 ctx.lineWidth=Math.max(3,canvas.width/250);ctx.font="bold "+Math.max(18,canvas.width/45)+"px system-ui";
 regions.forEach((r,i)=>{
  ctx.save();ctx.translate(r.cx,r.cy);ctx.rotate(r.angle||0);
  ctx.strokeStyle="#ffd447";ctx.strokeRect(-r.w/2,-r.h/2,r.w,r.h);
  ctx.restore();
  ctx.fillStyle="#ffd447";ctx.fillText(String(i+1),r.cx-r.w/3,r.cy-r.h/3);
 });
 if(drag){
  const a=drag;ctx.strokeStyle="#7af0e0";ctx.setLineDash([15,8]);
  ctx.strokeRect(a.startX,a.startY,a.endX-a.startX,a.endY-a.startY);
 }
 ctx.restore();
}
function coord(event){
 const el=$("#photoPreview"),r=el.getBoundingClientRect();
 return {x:(event.clientX-r.left)*canvas.width/r.width,y:(event.clientY-r.top)*canvas.height/r.height};
}
function bindPreview(){
 const preview=$("#photoPreview");
 preview.onpointerdown=e=>{
  if(!canvas||busy)return;
  const p=coord(e);drag={startX:p.x,startY:p.y,endX:p.x,endY:p.y};
  preview.setPointerCapture(e.pointerId);drawPreview();
 };
 preview.onpointermove=e=>{if(!drag)return;const p=coord(e);drag.endX=p.x;drag.endY=p.y;drawPreview()};
 preview.onpointerup=e=>{
  if(!drag)return;const p=coord(e),a=drag;drag=null;
  const w=Math.abs(p.x-a.startX),h=Math.abs(p.y-a.startY);
  if(w>=40&&h>=55&&regions.length<MAX_CARDS){
   const landscape=w>h;
   const reg={cx:(a.startX+p.x)/2,cy:(a.startY+p.y)/2,w:landscape?h:w,h:landscape?w:h,angle:landscape?Math.PI/2:0,manual:true};
   regions.push(reg);drawPreview();void recognizeAdded(reg);
  }else drawPreview();
 };
 preview.onpointercancel=()=>{drag=null;drawPreview()};
}
function optionText(row){
 const selected=row.selectedCode;
 const candidates=row.candidates.slice();
 if(selected&&!candidates.some(c=>c.code===selected))candidates.unshift({code:selected,score:null});
 return '<option value="">Sin identificar: no guardar</option>'+candidates.map(x=>{
  const c=baseCard(x.code);
  return '<option value="'+esc(x.code)+'"'+(selected===x.code?' selected':'')+'>'+esc(x.code+' · '+(c?.name||"")+(Number.isFinite(x.score)?' · sugerencia visual':''))+'</option>';
 }).join("");
}
async function readCode(region){
 if(!photoOcrLoading){
  photoOcrLoading=import("/scanner-ocr.js?v=ocr5").then(async module=>{
   const engine=module.createEngine(()=>{});
   await engine.init();
   if(!active){void engine.destroy();throw Error("Escáner cerrado")}
   photoOcr=engine;return engine;
  }).catch(error=>{photoOcrLoading=null;throw error});
 }
 const engine=await photoOcrLoading;
 const frame=makeCrop(region,canvas,900,1260);
 const result=await engine.recognizeCode(frame);
 return result.codes.find(id=>group(id).length)||null;
}
function chooseCode(row,code){
 if(!row||!code||!group(code).length)return false;
 row.selectedCode=code;row.printId=baseCard(code)?.id||"";
 if(!row.candidates.some(c=>c.code===code))row.candidates.unshift({code,score:null});
 row.confident=true;
 return true;
}
async function readCodeForRow(index){
 const row=rows[index],gen=generation;
 if(!row||busy||!active)return;
 busy=true;tell("Leyendo el código de la carta "+(index+1)+"…");refreshControls();
 try{
  const code=await readCode(row.region);
  if(!active||generation!==gen)return;
  if(!code){tell("No se ha podido leer el código. Busca manualmente o haz una foto más nítida.",true);return}
  chooseCode(row,code);
  tell("Código leído: "+code+". Comprueba la impresión exacta.");
 }catch(error){
  if(active&&generation===gen)tell("OCR no disponible: "+String(error?.message||error),true);
 }finally{if(active&&generation===gen){busy=false;rowList();refreshControls()}}
}
function rowList(){
 const host=$("#photoCards");if(!host)return;
 const total=rows.filter(r=>!r.omitted&&r.printId).reduce((t,r)=>t+r.count,0);
 $("#photoSave").disabled=busy||!total;
 $("#photoSave").textContent="Guardar "+total+" cartas en mi colección";
 host.innerHTML=rows.map((r,i)=>{
  const variants=group(r.selectedCode),chosen=variants.find(c=>c.id===r.printId);
  return '<article class="photo-card-row" data-photo-index="'+i+'">'+
   '<img src="'+r.thumb+'" alt="Recorte de carta '+(i+1)+'">'+
   '<div class="photo-card-fields"><b>Carta '+(i+1)+'</b><small>'+(r.confident?'Coincidencia probable: confirma la edición':'Revisar identificación')+'</small>'+
   '<label>Identificación<select data-photo-code>'+optionText(r)+'</select></label>'+
   '<div class="photo-guess-label">'+(r.confident?'Propuesta de reconocimiento (revisa la impresión)':'¿Cuál es? Toca una de estas cartas sugeridas:')+'</div>'+
   '<div class="photo-guesses">'+r.candidates.slice(0,8).map(candidate=>{
    const c=baseCard(candidate.code);
    if(!c)return '';
    return '<button type="button" data-photo-guess="'+esc(candidate.code)+'"'+(r.selectedCode===candidate.code?' class="photo-guess-selected"':'')+'>'+
      cardImg(c,"photo-guess-img")+'<span>'+esc(candidate.code)+'</span></button>';
   }).join('')+'</div>'+
   '<button type="button" data-photo-ocr>🔎 Leer código de la carta (OCR)</button>'+ 
   '<label>Buscar otra carta<input data-photo-search type="search" placeholder="Código o nombre de carta" autocomplete="off"></label>'+
   '<div data-photo-suggestions class="photo-suggestions"></div>'+
   '<label>Impresión exacta<select data-photo-print'+(!r.selectedCode?' disabled':'')+'><option value="">Selecciona impresión</option>'+
   variants.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===r.printId?' selected':'')+'>'+esc(c.id)+' · '+esc(printSetOf(c))+' · '+esc(variantKindOf(c))+'</option>').join("")+'</select></label>'+
   '<div class="photo-row-bottom"><label>Copias<input data-photo-qty type="number" min="1" max="99" value="'+r.count+'"></label>'+
   '<label class="photo-skip"><input data-photo-skip type="checkbox"'+(r.omitted?' checked':'')+'> Omitir</label>'+
   '<button type="button" data-photo-remove>Eliminar recorte</button></div></div></article>';
 }).join("");
 host.querySelectorAll("[data-photo-index]").forEach(el=>{
  const i=Number(el.dataset.photoIndex),r=rows[i];
  el.querySelectorAll("[data-photo-guess]").forEach(button=>button.onclick=()=>{
   chooseCode(r,button.dataset.photoGuess);r.confident=false;rowList();
  });
  el.querySelector("[data-photo-code]").onchange=e=>{
   r.selectedCode=e.target.value;
   r.printId=r.selectedCode?(baseCard(r.selectedCode)?.id||""):"";
   r.confident=false;rowList();
  };
  el.querySelector("[data-photo-print]").onchange=e=>{
   if(group(r.selectedCode).some(c=>c.id===e.target.value))r.printId=e.target.value;
   rowList();
  };
  el.querySelector("[data-photo-qty]").onchange=e=>{
   const q=Number(e.target.value);r.count=Number.isInteger(q)?Math.max(1,Math.min(99,q)):1;rowList();
  };
  el.querySelector("[data-photo-skip]").onchange=e=>{r.omitted=e.target.checked;rowList()};
  el.querySelector("[data-photo-remove]").onclick=()=>{
   rows.splice(i,1);regions.splice(i,1);drawPreview();rowList()
  };
  el.querySelector("[data-photo-ocr]").onclick=()=>void readCodeForRow(i);
  const search=el.querySelector("[data-photo-search]"),suggestions=el.querySelector("[data-photo-suggestions]");
  search.oninput=()=>{
   const q=search.value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
   if(q.length<2){suggestions.replaceChildren();return}
   const list=[],seen=new Set();
   for(const c of state.cards){
    const code=cardCode(c);
    if(seen.has(code))continue;
    if((code+" "+c.name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(q)){
     seen.add(code);list.push({code,name:c.name});if(list.length>=9)break;
    }
   }
   suggestions.innerHTML=list.map(c=>'<button type="button" data-code="'+esc(c.code)+'">'+esc(c.code+' · '+c.name)+'</button>').join("")||
    '<small>Sin resultados. Prueba con el código de la carta.</small>';
   suggestions.querySelectorAll("[data-code]").forEach(button=>button.onclick=()=>{
    r.selectedCode=button.dataset.code;r.printId=baseCard(r.selectedCode)?.id||"";r.confident=false;
    if(!r.candidates.some(c=>c.code===r.selectedCode))r.candidates.unshift({code:r.selectedCode,score:null});
    rowList();
   });
  };
 });
}
async function recognizeAdded(region){
 const gen=generation;
 busy=true;tell("Identificando el recorte añadido…");refreshControls();
 try{
  if(!workerReady)await workerStart();
  if(!active||gen!==generation)return;
  const ranked=await recognize(region);
  if(!active||gen!==generation)return;
  rows.push(selectedRow(region,ranked));
 }catch(e){
  if(!active||gen!==generation)return;
  rows.push(selectedRow(region));
  tell("Recorte añadido sin reconocimiento. Puedes elegir la carta manualmente.",true);
 }
 finally{if(active&&gen===generation){busy=false;drawPreview();rowList();refreshControls()}}
}
function refreshControls(){
 for(const q of ["#photoUpload","#photoCapture","#photoReset","#photoSave","#photoUndoBox","#photoLayoutApply","#photoLayout"]){
  const item=$(q);if(item)item.disabled=busy;
 }
 const u=$("#photoUndoBox");if(u)u.disabled=busy||!regions.length;
 const layout=$("#photoLayoutApply");if(layout)layout.disabled=busy||!canvas;
 const save=$("#photoSave");
 if(save)save.disabled=busy||!rows.some(r=>!r.omitted&&r.printId);
}
async function analyzeRegions(layout=0){
 if(!canvas||!active)return;
 const gen=++generation;
 stopDetection();workerStop();
 regions=[];rows=[];busy=true;rowList();refreshControls();tell("Localizando cartas…");
 try{
  if(layout>0)regions=layoutRegions(layout);
  else{
   try{regions=await detectionRegions(canvas)}
   catch(error){if(gen===generation)tell("Detección automática no disponible. Usando encuadre de una carta.",true)}
   if(!regions.length){
    regions=layoutRegions(1);
    tell("No se han encontrado bordes claros. Analizo la carta central; puedes elegir una distribución o dibujar recuadros.");
   }
  }
  if(!active||gen!==generation)return;
  $("#photoPreview").hidden=false;drawPreview();
  let visualReady=false;
  try{await workerStart();visualReady=workerReady}
  catch(error){
   if(!active||gen!==generation)return;
   tell("El índice visual no está disponible. Selecciona cada carta por código o nombre; los recortes están listos.",true);
  }
  for(let i=0;i<regions.length;i++){
   if(!active||gen!==generation)return;
   tell("Analizando carta "+(i+1)+" de "+regions.length+"…");
   let ranked=[];
   if(visualReady)try{ranked=await recognize(regions[i])}catch(error){console.warn("Lectura de recorte",error)}
   if(!active||gen!==generation)return;
   const row=selectedRow(regions[i],ranked);
   rows.push(row);rowList();
   if(!row.confident&&regions.length<=8){
    tell("Carta "+(i+1)+": intentando leer su código…");
    try{
     const code=await readCode(regions[i]);
     if(!active||gen!==generation)return;
     if(code)chooseCode(row,code);
     rowList();
    }catch(error){console.warn("OCR opcional foto",error)}
   }
   // Give the mobile browser an opportunity to paint progress between cards.
   if(i%2===1)await new Promise(resolve=>setTimeout(resolve,0));
  }
  const identified=rows.filter(r=>r.selectedCode).length;
  tell("Foto analizada: "+rows.length+" cartas, "+identified+" identificadas con confianza. Comprueba las demás y sus impresiones.");
 }catch(error){
  if(active&&gen===generation)tell("No se ha podido procesar la imagen: "+String(error.message||error),true);
 }finally{
  if(active&&gen===generation){busy=false;refreshControls();rowList();drawPreview()}
 }
}
async function processFile(file){
 if(!file)return;
 if(!file.type.startsWith("image/")||file.size>MAX_FILE||file.size===0){
  tell("Selecciona una imagen JPG, PNG o WebP de hasta 22 MB.",true);return
 }
 const gen=++generation;
 stopDetection();workerStop();busy=true;regions=[];rows=[];canvas=null;
 tell("Abriendo imagen…");refreshControls();$("#photoPreview").hidden=true;rowList();
 try{
  const source=await normalizeImage(file);
  if(!active||gen!==generation)return;
  canvas=source;
  const chosen=Number($("#photoLayout")?.value||0);
  await analyzeRegions(chosen);
 }catch(error){
  if(active&&gen===generation)tell("No se puede abrir la imagen: "+String(error.message||error),true);
 }finally{
  if(active&&busy&&gen===generation){busy=false;refreshControls()}
 }
}
async function saveCards(){
 if(busy||!active||!state.user?.id||!state.collectionReady)return;
 const picked=rows.filter(r=>!r.omitted);
 if(picked.some(r=>!r.selectedCode||!r.printId||!group(r.selectedCode).some(c=>c.id===r.printId))){
  tell("Corrige o marca como omitidas las cartas sin identificar antes de guardar.",true);return;
 }
 const byPrint=new Map();
 for(const r of picked)byPrint.set(r.printId,(byPrint.get(r.printId)||0)+r.count);
 for(const [id,count] of byPrint)if(Number(qty(id)||0)+count>99){
  tell("La impresión "+id+" superaría las 99 copias. Modifica su cantidad.",true);return;
 }
 const userId=state.user.id;busy=true;refreshControls();let saved=0,failed=0;
 for(const [id,count] of byPrint){
  if(!active||state.user?.id!==userId)break;
  const before=Number(qty(id)||0);
  let ok=false;try{ok=await setQty(id,before+count)}catch(error){console.warn("Foto multiescáner",error)}
  if(ok){
   saved+=count;rows=rows.filter(r=>r.omitted||r.printId!==id);
   // Remove the matching overlay regions only for persisted copies.
  }else failed++;
 }
 if(!active)return;
 regions=rows.map(r=>r.region);
 busy=false;drawPreview();rowList();refreshControls();
 if(failed)tell("Guardadas "+saved+" cartas; "+failed+" impresiones no pudieron guardarse. Conservadas para reintentar.",true);
 else tell("Guardadas "+saved+" cartas. Ningún recorte pendiente.");
}
function close(){
 if(!active)return;
 generation++;active=false;busy=false;
 stopDetection();workerStop();
 if(photoOcr){void photoOcr.destroy();photoOcr=null}photoOcrLoading=null;
 canvas=null;regions=[];rows=[];drag=null;
 $("#photoScanPanel")?.remove();
 document.querySelector("#photoStyles")?.remove();
 window.dispatchEvent(new Event("onepiece:photo-closed"));
}
function open(){
 if(active)return;
 if(!state.user?.id||!state.collectionReady||!state.sb){alert("Inicia sesión y carga tu colección antes de escanear fotografías.");return}
 if(!state.cards?.length){alert("El catálogo aún no está disponible.");return}
 active=true;generation++;
 const el=document.createElement("section");el.id="photoScanPanel";
 el.innerHTML='<div class="photo-shell"><header><div><b>Escanear foto</b><small>Detecta varias cartas de una sola imagen</small></div><button id="photoClose" type="button">✕ Cerrar</button></header>'+
 '<div class="photo-actions"><button type="button" id="photoUpload">Elegir imagen</button>'+
 '<button type="button" id="photoCapture">Hacer fotografía</button>'+
 '<button type="button" id="photoUndoBox" disabled>Quitar último recorte</button>'+
 '<button type="button" id="photoReset">Limpiar</button></div>'+
 '<input type="file" id="photoFile" accept="image/jpeg,image/png,image/webp,image/*" hidden>'+
 '<input type="file" id="photoCameraFile" accept="image/*" capture="environment" hidden>'+ 
 '<div class="photo-layout"><label>Distribución de cartas <select id="photoLayout">'+photoLayoutOptions().map(([v,label])=>'<option value="'+v+'">'+esc(label)+'</option>').join('')+'</select></label>'+ 
 '<button type="button" id="photoLayoutApply" disabled>Reanalizar distribución</button></div>'+
 '<p class="photo-tip">Extiende las cartas boca arriba, separadas, sobre un fondo uniforme y fotografía desde arriba. También puedes dibujar recuadros sobre la foto para añadir cartas que falten.</p>'+
 '<div id="photoStatus" role="status" aria-live="polite">Elige una imagen para empezar.</div>'+
 '<canvas id="photoPreview" hidden aria-label="Fotografía con recuadros. Arrastra para marcar una carta no detectada."></canvas>'+
 '<h3>Cartas identificadas</h3><div id="photoCards"></div>'+
 '<footer><button id="photoSave" type="button" disabled>Guardar 0 cartas en mi colección</button>'+
 '<span>Las fotos se procesan en este dispositivo. Nada se guarda sin confirmación.</span></footer></div>';
 document.body.appendChild(el);
 const style=document.createElement("style");style.id="photoStyles";
 style.textContent="#photoScanPanel{position:fixed;inset:0;z-index:10020;background:#070b11;color:#f5f6fb;overflow-y:auto;font:14px system-ui,sans-serif}"+
 "#photoScanPanel *{box-sizing:border-box}#photoScanPanel .photo-shell{max-width:880px;margin:auto;padding:12px 12px 100px}"+
 "#photoScanPanel header{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0 16px}#photoScanPanel header b{font-size:21px}#photoScanPanel header small{display:block;color:#bac6d7;font-size:12px}"+
 "#photoScanPanel button{border:1px solid #637088;border-radius:9px;background:#233246;color:white;padding:10px;cursor:pointer;font-weight:700}#photoScanPanel button:disabled{opacity:.4;cursor:default}"+
 "#photoScanPanel .photo-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#photoScanPanel .photo-layout{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin:10px 0}#photoScanPanel .photo-layout label{font-size:12px}#photoScanPanel .photo-layout button{min-height:38px}#photoScanPanel .photo-tip{color:#cbd3e2;font-size:12px;line-height:1.45}"+
 "#photoScanPanel #photoStatus{margin:12px 0;padding:10px;border:1px solid #405a71;background:#15202c;border-radius:8px}#photoScanPanel .photo-error{color:#ffc5af!important;border-color:#b75f4e!important}"+
 "#photoScanPanel #photoPreview{display:block;width:100%;height:auto;touch-action:none;border:1px solid #74849a;border-radius:8px}#photoScanPanel #photoPreview[hidden]{display:none}"+
 "#photoScanPanel #photoCards{display:grid;gap:10px}#photoScanPanel .photo-card-row{display:flex;gap:12px;background:#162131;border:1px solid #3b4c65;border-radius:11px;padding:10px}"+
 "#photoScanPanel .photo-card-row>img{width:98px;height:138px;object-fit:contain;align-self:flex-start;border-radius:5px;background:#000}"+
 "#photoScanPanel .photo-card-fields{flex:1;min-width:0;display:grid;gap:6px}#photoScanPanel .photo-card-fields>small{color:#ffdf80}"+
 "#photoScanPanel label{display:grid;gap:3px;font-size:12px;color:#cfd5e1}#photoScanPanel select,#photoScanPanel input{width:100%;min-width:0;padding:8px;background:#26364c;color:#fff;border:1px solid #7d8da3;border-radius:7px;font:inherit}"+
 "#photoScanPanel .photo-row-bottom{display:flex;gap:8px;align-items:end;flex-wrap:wrap}#photoScanPanel .photo-row-bottom input[type=number]{width:70px}#photoScanPanel .photo-row-bottom label.photo-skip{display:flex;align-items:center;gap:4px}#photoScanPanel .photo-skip input{width:auto}"+
 "#photoScanPanel .photo-suggestions{display:grid;gap:3px}#photoScanPanel .photo-suggestions button{text-align:left;font-size:12px}"+
 "#photoScanPanel .photo-guess-label{font-size:12px;color:#ffe2a1}#photoScanPanel .photo-guesses{display:flex;overflow-x:auto;gap:7px;max-width:100%;padding:5px 0;scroll-snap-type:x proximity}"+
 "#photoScanPanel .photo-guesses button{flex:0 0 78px;padding:5px;background:#1f2a3a;border:2px solid #53637b;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}"+
 "#photoScanPanel .photo-guesses button.photo-guess-selected{border-color:#ffd447}#photoScanPanel img.photo-guess-img{width:64px;height:89px;object-fit:contain;background:#050505}#photoScanPanel .photo-guesses span{font-size:10px;white-space:nowrap}"+
 "#photoScanPanel footer{position:sticky;bottom:0;background:#0b121ff5;padding:12px;margin-top:12px;display:grid;gap:7px;border-top:1px solid #526075}#photoScanPanel footer button{background:#ffd447;color:#171717;font-size:17px}#photoScanPanel footer span{font-size:11px;color:#bfcadc;text-align:center}"+
 "@media(max-width:500px){#photoScanPanel .photo-card-row>img{width:70px;height:100px}#photoScanPanel .photo-row-bottom button{font-size:11px;padding:8px}}";
 document.head.appendChild(style);
 $("#photoClose").onclick=()=>close();
 $("#photoUpload").onclick=()=>$("#photoFile").click();
 $("#photoCapture").onclick=()=>$("#photoCameraFile").click();
 $("#photoFile").onchange=e=>{void processFile(e.target.files?.[0]);e.target.value=""};
 $("#photoCameraFile").onchange=e=>{void processFile(e.target.files?.[0]);e.target.value=""};
 $("#photoLayoutApply").onclick=()=>void analyzeRegions(Number($("#photoLayout").value));
 $("#photoReset").onclick=()=>{
  if(rows.length&&!confirm("¿Descartar los recortes sin guardar?"))return;
  ++generation;workerStop();stopDetection();canvas=null;regions=[];rows=[];busy=false;
  $("#photoPreview").hidden=true;rowList();refreshControls();tell("Elige una imagen para empezar.");
 };
 $("#photoUndoBox").onclick=()=>{if(busy||!regions.length)return;regions.pop();rows.pop();drawPreview();rowList();refreshControls()};
 $("#photoSave").onclick=()=>void saveCards();
 bindPreview();refreshControls();
}
window.OnePiecePhotoScanner={open,close};
window.openOnePiecePhotoScanner=open;
})();
