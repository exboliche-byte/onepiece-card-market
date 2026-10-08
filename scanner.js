(() => {
"use strict";
let video=null,stream=null,timer=null,ocrWorker=null,ocrLoading=null,closed=true,busy=false,locked=false,generation=0;
let frame="",lastCode="",streak=0,matches=[],recognition=null,aiDisabled=false,suggested=null;
let aiRetryAt=0,scanCount=0,source="vision",liveSocket=null,liveBusy=false,liveReconnects=0,liveTimer=null,liveSerial=0,providerAbort=null,liveConfigured=false;
const style=document.createElement("style");
style.textContent=[
"#scanLaunch{position:fixed;bottom:80px;right:14px;z-index:200;background:#ffd447;color:#111;border:0;border-radius:28px;padding:13px 15px;font-weight:800;box-shadow:0 6px 20px #0009;cursor:pointer}",
"#scanPanel{position:fixed;inset:0;z-index:9999;overflow-y:auto;overscroll-behavior:contain;background:#080a10;color:#fff;padding:env(safe-area-inset-top,8px) 10px env(safe-area-inset-bottom,8px);font-family:system-ui,sans-serif}",
"#scanPanel .inner{max-width:680px;margin:auto;display:flex;flex-direction:column;min-height:100%;gap:7px}",
"#scanPanel h2{font-size:17px;margin:3px 0;display:flex;justify-content:space-between;align-items:center;gap:8px}",
"#scanPanel .scanFrame{position:relative;flex:none;height:clamp(300px,calc(100dvh - 235px),1050px);width:100%;margin:0;background:#050505;overflow:hidden;border-radius:11px;border:1px solid #4b5465}",
"#scanPanel .scanFrame video,#scanPanel .scanFrame .scanStill{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}",
"#scanPanel .aim{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);height:min(87%,109vw);max-width:85%;aspect-ratio:0.716;border:2px dashed #ffd447c8;border-radius:13px;pointer-events:none;box-shadow:0 0 0 200vmax #0000002b}",
"#scanPanel.locked .aim{display:none}",
"#scanPanel .result{position:absolute;left:5px;right:5px;bottom:5px;max-height:88%;overflow-y:auto;background:#101724f4;border-radius:12px;padding:10px;border:1px solid #ffd447}",
"@media (min-width:720px){#scanPanel .scanFrame{height:clamp(400px,calc(100dvh - 210px),1100px)}#scanPanel .aim{height:min(88%,56vw)}}",




"#scanPanel .found{display:flex;gap:11px;align-items:flex-start}#scanPanel .found img{width:72px;max-height:110px;object-fit:contain}",
"#scanPanel button{padding:10px;margin:3px;border:1px solid #526079;border-radius:9px;background:#263248;color:white;font-weight:700;cursor:pointer}#scanPanel button.primary{background:#ffd447;color:#151515;border-color:#ffd447}",
"#scanPanel input,#scanPanel select{padding:10px;background:#263248;color:white;border:1px solid #526079;max-width:100%;border-radius:8px}",
"#scanPanel #scanStatus{min-height:22px;color:#c5cfdb}#scanPanel .muted{color:#b1bccd;font-size:12px}#scanPanel .option{display:block;text-align:left;width:100%}",
].join("");document.head.append(style);
const $=s=>document.querySelector("#scanPanel "+s);
const root=()=>document.querySelector("#scanPanel");
const esc=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&#39;","'":"&#39;"}[x]));
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
const cardCode=s=>normalize(s).replace(/[\s_]/g,"").replace(/[^A-Z0-9-]/g,"").replace(/^((?:OP|ST|EB|PRB)\d{2})(\d{3})$/,"$1-$2");
const say=s=>{const node=$("#scanStatus");if(node)node.textContent=s};
const valid=()=>!closed&&!!root();
function takePhoto(){
 if(!video||video.readyState<2||!video.videoWidth)return "";
 // Copy the same portion of the camera which is actually visible in the UI
 // (the video is object-fit: cover). Avoid cropping off the printed code.
 const sw=video.videoWidth,sh=video.videoHeight;
 const rect=video.getBoundingClientRect(),dw=Math.max(1,rect.width),dh=Math.max(1,rect.height);
 const scale=Math.max(dw/sw,dh/sh);
 const cropW=Math.min(sw,dw/scale),cropH=Math.min(sh,dh/scale);
 const sx=(sw-cropW)/2,sy=(sh-cropH)/2;
 const c=document.createElement("canvas"),w=Math.min(960,Math.round(cropW));
 c.width=Math.max(320,w);c.height=Math.max(420,Math.round(c.width*cropH/cropW));
 c.getContext("2d").drawImage(video,sx,sy,cropW,cropH,0,0,c.width,c.height);
 return c.toDataURL("image/jpeg",.78);
}
function plan(ms=4200){clearTimeout(timer);if(valid()&&!locked&&source==="vision")timer=setTimeout(scan,ms)}
async function getOCR(){
 if(ocrWorker)return ocrWorker;
 if(ocrLoading)return ocrLoading;
 ocrLoading=(async()=>{
   if(!window.Tesseract)await new Promise((yes,no)=>{const tag=document.createElement("script");tag.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";tag.onload=yes;tag.onerror=()=>no(Error("Motor OCR no disponible"));document.head.append(tag)});
   const created=await window.Tesseract.createWorker("eng");
   if(!valid()){await created.terminate();throw Error("Escáner cerrado")}
   ocrWorker=created;return created;
 })().finally(()=>{ocrLoading=null});
 return ocrLoading;
}
async function localGuess(image,turn){
 try{
   const w=await getOCR();if(turn!==generation||!valid()||locked)return null;
   const result=await w.recognize(image);if(turn!==generation||!valid()||locked)return null;
   const raw=normalize(result.data?.text),flat=raw.replace(/[^A-Z0-9]/g,""),words=new Set(raw.split(/[^A-Z0-9]+/).filter(Boolean));
   const ranked=state.cards.map(c=>{
     const code=normalize(baseId(c.id)).replace(/[^A-Z0-9]/g,"");
     const name=normalize(c.name);
     const parts=name.split(/[^A-Z0-9]+/).filter(x=>x.length>2);
     let score=parts.filter(x=>words.has(x)).length/Math.max(1,parts.length)*25;
     if(code.length>=5&&flat.includes(code))score+=90;
     if(name.length>3&&raw.includes(name))score+=24;
     return {c,score};
   }).filter(x=>x.score>=34).sort((a,b)=>b.score-a.score);
   if(!ranked.length)return null;
   const best=ranked[0];
   return {c:best.c,confidence:best.score>=90?"medium":"low",matches:ranked.slice(0,10),engine:"OCR"};
 }catch(e){console.warn("OCR scanner",e?.message||e);return null}
}
function group(c){
 const key=normalize(baseId(c.id));
 return state.cards.filter(x=>normalize(baseId(x.id))===key);
}
function resolveAI(data){
 if(!data||data.confidence==="none")return null;
 const code=cardCode(data.code);
 let matching=code?state.cards.filter(x=>cardCode(baseId(x.id))===code):[];
 let byCode=matching.length>0;
 if(!byCode&&data.name){
   const name=normalize(data.name);
   matching=state.cards.filter(x=>normalize(x.name)===name);
 }
 if(!matching.length)return null;
 // A name alone can refer to many unrelated cards. Never auto-lock that case.
 const unique=[...new Set(matching.map(x=>normalize(baseId(x.id))))];
 if(!byCode&&unique.length>1)return {ambiguous:true,choices:matching.slice(0,15),description:data.art_description||""};
 const base=matching.find(x=>cardCode(x.id)===code)||matching.find(x=>variantKindOf(x)==="base")||matching[0];
 const other=matching.filter(x=>x.id!==base.id).slice(0,8);
 return {c:base,matches:[{c:base,score:100},...other.map(c=>({c,score:65}))],confidence:data.confidence,engine:"IA",description:data.art_description||"",variantHint:data.variant_hint,confirmedCode:byCode&&data.readable_code===true};
}
async function vision(image,turn){
 if(aiDisabled||!state.user||!state.sb||Date.now()<aiRetryAt)return null;
 const session=await state.sb.auth.getSession();
 const token=session?.data?.session?.access_token;
 if(!token){aiDisabled=true;return null}
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25500);
 try{
   const response=await fetch("/api/recognize-card",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({image}),signal:controller.signal});
   if(turn!==generation||!valid()||locked)return null;
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
     if(response.status===401){aiDisabled=true;say("Sesión de IA caducada. El escáner seguirá intentando con OCR.");}
     else if(response.status===429||response.status===503){aiRetryAt=Date.now()+30000;say((data.error||"IA ocupada")+". Se reintentará automáticamente.");}
     else{aiRetryAt=Date.now()+12000;say(data.error||"Error temporal del reconocimiento visual.");}
     return null;
   }
   return resolveAI(data);
 }finally{clearTimeout(timeout)}
}

// TCGGraph offers a purpose-built One Piece matcher over a persistent socket.
// The server mints short-lived tickets; neither its paid key nor the Supabase
// access token is put into a socket URL.
function stopLive(){
  liveSerial++;
  clearTimeout(liveTimer);liveTimer=null;
  liveBusy=false;
  if(providerAbort){providerAbort.abort();providerAbort=null}
  const old=liveSocket;liveSocket=null;
  if(old)try{old.close()}catch{}
}
function fallbackVision(message=""){
  stopLive();source="vision";liveConfigured=false;
  if(valid()&&!locked){
    if(message)say(message+" Seguiré buscando con la IA disponible.");
    plan(500);
  }
}
function matchLiveCard(m){
  const entry=m?.card||{};
  const print=entry.gameData||{};
  const groupId=val=>{
    const text=normalize(typeof val==="string"?val:"");
    const matched=text.match(/(?:^|[^A-Z0-9])((?:OP|ST|EB|PRB)[-_ ]?\d{2}[-_ ]?\d{3}|P[-_ ]?\d{3})(?:$|[^A-Z0-9])/);
    if(!matched)return "";
    return matched[1].replace(/[-_ ]/g,"").replace(/^((?:OP|ST|EB|PRB)\d{2})(\d{3})$/,"$1-$2").replace(/^P(\d{3})$/,"P-$1");
  };
  const values=[entry.cardNumber,entry.collectorNumber,entry.number,entry.code,entry.printedNumber,print.cardNumber,print.code,print.number,entry.id];
  const candidates=values.map(groupId).filter(Boolean);
  const setRaw=entry.set?.code||entry.setCode||entry.set?.id||(typeof entry.set==="string"?entry.set:"");
  const setMatch=normalize(setRaw).replace(/[^A-Z0-9]/g,"").match(/^(OP|ST|EB|PRB)\d{2}$/);
  if(setMatch)for(const val of values){
    const digits=String(val||"").trim().match(/^\d{1,3}$/);
    if(digits)candidates.push(setMatch[0]+"-"+digits[0].padStart(3,"0"));
  }
  let same=[];
  for(const code of [...new Set(candidates)]){
    same=state.cards.filter(c=>groupId(baseId(c.id))===code);
    if(same.length)break;
  }
  // If an actual printed code is present but absent from our catalog, never
  // replace it silently with a different card that happens to share the name.
  if(!same.length&&candidates.length)return null;
  if(!same.length&&entry.name){
    const byName=state.cards.filter(c=>normalize(c.name)===normalize(entry.name));
    if(new Set(byName.map(c=>baseId(c.id))).size===1)same=byName;
  }
  if(!same.length)return null;
  const first=same.find(c=>variantKindOf(c)==="base")||same[0];
  const confidence=Number(m.confidence)||0;
  if(confidence<.9)return null;
  return {
    c:first,engine:"TCGGraph",confidence:confidence>=.92?"high":"medium",
    confirmedCode:candidates.length>0,
    matches:same.map(c=>({c,score:confidence*100})),
    description:m.printingResolved===false?"La imagen puede corresponder a más de una impresión. Comprueba la versión.":""
  };
}
function scheduleLive(serial,delay=650){
  clearTimeout(liveTimer);
  if(!valid()||locked||source!=="live"||serial!==liveSerial)return;
  liveTimer=setTimeout(()=>sendLive(serial),delay);
}
function sendLive(serial){
  if(serial!==liveSerial||source!=="live"||!valid()||locked||liveBusy||document.hidden)return;
  if(!liveSocket||liveSocket.readyState!==WebSocket.OPEN)return;
  const image=takePhoto();
  if(!image){scheduleLive(serial,500);return}
  frame=image;scanCount++;
  try{
    const binary=atob(image.slice(image.indexOf(",")+1));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    liveBusy=true;
    liveSocket.send(bytes.buffer);
    say("Escáner visual en directo · fotograma "+scanCount+" · buscando…");
  }catch(e){
    liveBusy=false;
    say("No se pudo enviar un fotograma. Reintentando…");
    scheduleLive(serial,1200);
  }
}
async function startLive(turn){
  if(!valid()||locked||turn!==generation)return;
  stopLive();
  const serial=liveSerial;
  const ctrl=new AbortController();providerAbort=ctrl;
  say("Conectando reconocimiento especializado…");
  try{
    const session=await state.sb.auth.getSession();
    if(serial!==liveSerial||turn!==generation||!valid()||locked)return;
    const token=session?.data?.session?.access_token;
    if(!token){fallbackVision("Sesión del escáner caducada.");return}
    const res=await fetch("/api/scan-ticket",{
      method:"POST",
      headers:{Authorization:"Bearer "+token},
      signal:ctrl.signal
    });
    if(serial!==liveSerial||turn!==generation||!valid()||locked)return;
    const body=await res.json().catch(()=>({}));
    if(serial!==liveSerial||turn!==generation||!valid()||locked)return;
    providerAbort=null;
    if(!res.ok||!body.ticket){
      fallbackVision(body.code==="NOT_CONFIGURED"?"Reconocimiento especializado no configurado.":body.error||"Servicio especializado sin conexión.");
      return;
    }
    liveConfigured=true;source="live";
    const ws=new WebSocket("wss://api.tcggraph.com/v1/scan?ticket="+encodeURIComponent(body.ticket));
    liveSocket=ws;
    ws.onopen=()=>{
      if(serial!==liveSerial||!valid()||locked)return;
      ws.send(JSON.stringify({type:"config",games:["one-piece"],minConfidence:.92}));
      say("Reconocimiento continuo de One Piece conectado. Centra una carta.");
      scheduleLive(serial,200);
    };
    ws.onmessage=event=>{
      if(serial!==liveSerial||!valid()||locked)return;
      let result;
      try{result=JSON.parse(event.data)}catch{return}
      if(result.type==="ready")return;
      if(result.type==="closing"){say("Renovando conexión del escáner…");return}
      if(!["match","unresolved","error"].includes(result.type))return;
      liveBusy=false;
      if(result.type==="match"&&result.matches?.length){
        liveReconnects=0;
        const hit=matchLiveCard(result.matches[0]);
        if(hit){consider(hit);if(locked)return}
        else say("Tarjeta detectada, pero no coincide con una impresión identificable en nuestro catálogo. Sigue encuadrando.");
      }else if(result.type==="unresolved"){
        const reason=result.unresolved?.[0]?.reason;
        const advice={glare:"Inclina la carta para evitar reflejos.",blurred:"Acerca la carta y mantenla quieta.",cropped:"Muestra los cuatro bordes de la carta."};
        say("Buscando continuamente · "+(advice[reason]||"Centra la carta dentro del marco."));
      }else say("Fotograma no procesado. Continuando reconocimiento…");
      if(!locked)scheduleLive(serial,600);
    };
    ws.onerror=()=>{if(serial===liveSerial)say("Conexión del escáner interrumpida; recuperando…")};
    ws.onclose=()=>{
      if(serial!==liveSerial||!valid()||locked)return;
      if(liveReconnects<2){
        liveReconnects++;
        const attempt=liveReconnects;
        stopLive();
        liveReconnects=attempt;
        liveConfigured=true;
        say("Restableciendo reconocimiento visual…");
        liveTimer=setTimeout(()=>startLive(generation),1500*attempt);
      }else fallbackVision("El reconocimiento en directo se desconectó.");
    };
  }catch(e){
    if(serial===liveSerial&&valid()&&!locked)fallbackVision("No se pudo iniciar el reconocimiento continuo.");
  }finally{
    if(providerAbort===ctrl)providerAbort=null;
  }
}
function resume(){
 generation++;locked=false;busy=false;streak=0;lastCode="";suggested=null;recognition=null;root()?.classList.remove("locked");
 $(".scanStill")?.remove();const result=$("#scanResult");if(result)result.replaceChildren();
 if(video)video.style.display="";const hint=$("#scanHint");if(hint)hint.innerHTML="";
 say("Buscando cartas continuamente…");
 if(liveConfigured)startLive(generation);
 else plan(600);
}
function consider(hit){
 if(!hit)return false;
 if(hit.ambiguous){
   suggested=null;streak=0;
   say("La IA encontró varias cartas con el mismo nombre. Busca el código o selecciona manualmente.");
   return false;
 }
 const key=normalize(baseId(hit.c.id));
 streak=lastCode===key?streak+1:1;lastCode=key;
 // Strong visual recognition with legible printed ID can freeze immediately;
 // weaker recognition needs consecutive frames of the same card.
 const need=(hit.engine==="IA"&&hit.confidence==="high"&&hit.confirmedCode)||(hit.engine==="TCGGraph"&&hit.confidence==="high")?1:2;
 if(hit.confidence==="low") {
   suggested=hit;
   const hint=$("#scanHint");
   if(hint)hint.innerHTML='<button id="scanReview">Ver posible carta: '+esc(hit.c.name)+'</button>';
   $("#scanReview").onclick=()=>show(hit);
   say("Coincidencia incierta: "+hit.c.name+". Confírmala manualmente.");
   return false;
 }
 if(streak>=need){show(hit);return true}
 say("Posible "+hit.c.name+" ("+hit.engine+"). Verificando…");return false;
}
async function scan(){
 if(!valid()||locked||busy)return;
 const turn=generation;busy=true;scanCount++;
 try{
   const photo=takePhoto();
   if(!photo){plan(900);return}
   frame=photo;
   say("Búsqueda continua · intento "+scanCount+(Date.now()<aiRetryAt?" · IA reintentará tras la pausa":" · analizando con IA"));
   const ai=await vision(photo,turn);
   if(!valid()||locked||turn!==generation)return;
   if(ai?.c){if(consider(ai))return}
   else if(ai?.ambiguous){consider(ai)}
   else{
     if(!state.user&&!aiDisabled)say("Inicia sesión para usar IA. OCR disponible sin iniciar sesión.");
     const local=await localGuess(photo,turn);
     if(!valid()||locked||turn!==generation)return;
     if(local)consider(local);
     else if(!ai?.ambiguous)say("Escaneo activo · intento "+scanCount+". Centra una sola carta, acerca la cámara y evita reflejos.");
   }
 }catch(e){
   if(valid()&&turn===generation){say("Error de reconocimiento: "+(e.name==="AbortError"?"consulta agotada":e.message));console.warn("scanner",e);}
 }finally{if(turn===generation){busy=false;if(valid()&&!locked)plan()}}
}
function show(hit){
 if(!valid()||!hit?.c)return;
 generation++;locked=true;recognition=hit;matches=hit.matches||[];
 clearTimeout(timer);stopLive();root()?.classList.add("locked");
 const image=root().querySelector(".scanFrame");
 let still=$(".scanStill");if(!still){still=document.createElement("img");still.className="scanStill";image.insertBefore(still,image.firstChild)}
 still.src=frame;if(video)video.style.display="none";
 const c=hit.c,versions=group(c);
 const total=versions.reduce((sum,x)=>sum+qty(x.id),0),target=playsetTarget(c),need=Math.max(0,target-total);
 const alts=[...new Map(matches.map(x=>[x.c.id,x.c])).values()].filter(x=>normalize(baseId(x.id))!==normalize(baseId(c.id))).slice(0,5);
 const selector='<option value="">Selecciona la impresión exacta…</option>'+versions.map(x=>'<option value="'+esc(x.id)+'" '+(versions.length===1?'selected':'')+'>'+esc(x.id)+' · '+esc(variantKindOf(x))+' · '+esc(printSetOf(x))+' · tengo '+qty(x.id)+'</option>').join("");
 const host=$("#scanResult");
 host.innerHTML='<div class="result"><div class="found"><img id="scanCardPicture" src="'+esc(imageCdnUrl(c))+'" data-image-official="'+esc(officialImageUrl(c))+'" data-image-fallback="'+esc(fallbackImageUrl(c))+'" alt="Carta candidata"><div><b>'+esc(c.name)+'</b><div>'+esc(baseId(c.id))+'</div><div>Copias del mismo número: <b>'+total+'</b></div><div>'+(need?'Faltan <b>'+need+'</b> para el playset':'<b>Playset completo</b>')+' ('+target+')</div><div class="muted">'+esc(hit.engine)+' · '+esc(hit.confidence||"manual")+'</div></div></div>'+
 (hit.description?'<p class="muted">La IA ve: '+esc(hit.description)+'</p>':'')+
 '<label for="scanVariant">Elige la impresión exacta:</label><br><select id="scanVariant">'+selector+'</select><div id="scanExactCount" class="muted" style="margin:7px 0"></div>'+
 (versions.length>1?'<div class="muted">Existen varias versiones: comprueba la ilustración antes de guardar.</div>':'')+
 '<div><button class="primary" id="scanAdd">+1 y continuar</button><input type="number" value="2" min="1" max="99" id="scanCount" style="width:67px"><button class="primary" id="scanAddMore">Añadir copias y continuar</button><button id="scanSkip">Cerrar y continuar</button></div>'+
 (alts.length?'<details><summary>¿No coincide? Otras propuestas</summary>'+alts.map(x=>'<button class="option" data-scan-alt="'+esc(x.id)+'">'+esc(x.id)+' · '+esc(x.name)+'</button>').join("")+'</details>':'')+
 '<button id="scanManualResult">Buscar otra carta</button></div>';
 const selected=()=>{
   const id=$("#scanVariant")?.value||"";
   return versions.find(x=>x.id===id)||null;
 };
 const display=()=>{
   const x=selected(),node=$("#scanExactCount"),pic=$("#scanCardPicture");
   if(node)node.textContent=x?"Tienes "+qty(x.id)+" copias de esta impresión.":"Debes elegir una impresión antes de añadir.";
   if(x&&pic){pic.dataset.imageRecovery="0";pic.dataset.imageStep="";pic.dataset.imageOfficial=officialImageUrl(x);pic.dataset.imageFallback=fallbackImageUrl(x);pic.src=imageCdnUrl(x);}
 };
 $("#scanVariant").onchange=display;display();
 const add=async count=>{
   if(!state.user||!state.collectionReady){say("Debes iniciar sesión y cargar tu colección antes de añadir.");return}
   const c=selected(),n=Number(count);
   if(!c){say("Selecciona primero la impresión exacta.");return}
   if(!Number.isInteger(n)||n<1||n>99){say("La cantidad debe estar entre 1 y 99.");return}
   const current=qty(c.id),next=Math.min(99,current+n);
   if(next===current){say("Ya tienes el máximo de copias admitido.");return}
   const buttons=["#scanAdd","#scanAddMore"].map(id=>$(id)).filter(Boolean);
   buttons.forEach(button=>button.disabled=true);
   say("Guardando la carta en Supabase…");
   const saved=await setQty(c.id,next);
   if(!valid())return;
   buttons.forEach(button=>button.disabled=false);
   if(!saved){say("No se pudo guardar la carta en la nube. La imagen sigue congelada.");return}
   resume();say("Guardadas "+(next-current)+" copia(s) de "+c.id+" en Supabase. Continúa escaneando.");
 };
 $("#scanAdd").onclick=()=>add(1);
 $("#scanAddMore").onclick=()=>add($("#scanCount").value);
 $("#scanSkip").onclick=resume;
 $("#scanManualResult").onclick=manual;
 host.querySelectorAll("[data-scan-alt]").forEach(btn=>btn.onclick=()=>show({...hit,c:card(btn.dataset.scanAlt)}));
 say("Imagen congelada. Comprueba la edición antes de guardarla.");
}
function manual(){
 if(!valid())return;
 generation++;locked=true;clearTimeout(timer);stopLive();root()?.classList.add("locked");
 const el=$("#scanManualArea");
 el.innerHTML='<input id="scanSearch" placeholder="Nombre o código de la carta" autocomplete="off"><div id="scanHits"></div>';
 const input=$("#scanSearch");
 input.oninput=()=>{
   const q=normalize(input.value),container=$("#scanHits");
   if(q.length<2){container.innerHTML="";return}
   container.innerHTML=state.cards.filter(c=>normalize(c.id+" "+c.name).includes(q)).slice(0,30).map(c=>'<button class="option" data-pick="'+esc(c.id)+'">'+esc(c.id)+' · '+esc(c.name)+'</button>').join("");
   container.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{
     frame=takePhoto()||frame;show({c:card(b.dataset.pick),confidence:"manual",engine:"Búsqueda manual",matches:[]});
     el.innerHTML="";
   });
 };input.focus();say("Busca una carta o pulsa Reanudar para seguir escaneando.");
}
async function open(){
 if(root())return;
 if(!state.user||!state.collectionReady||!state.sb){alert("Inicia sesión y carga tu colección desde Supabase antes de escanear cartas.");return}
 if(!state.cards?.length){alert("El catálogo todavía no ha terminado de cargar.");return}
 generation++;const turn=generation;closed=false;locked=false;busy=false;aiDisabled=false;aiRetryAt=0;scanCount=0;streak=0;lastCode="";liveConfigured=false;liveReconnects=0;
 const ui=document.createElement("section");ui.id="scanPanel";
 ui.innerHTML='<div class="inner"><h2>Escáner con IA <button id="scanClose" type="button">✕ Cerrar</button></h2><div id="scanStatus" role="status">Abriendo cámara…</div><div class="scanFrame"><video muted playsinline autoplay></video><div class="aim"></div><div id="scanResult"></div></div><div id="scanHint"></div><button id="scanResume">Reanudar reconocimiento</button><button id="scanManual">Buscar manualmente</button><div id="scanManualArea"></div><p class="muted">La IA analiza fotografías en la nube. Solo se envían imágenes al reconocer con tu cuenta. Los resultados pueden equivocarse: confirma siempre la impresión antes de guardarla.</p></div>';
 document.body.append(ui);
 video=$("#scanPanel video")||root().querySelector("video");
 $("#scanClose").onclick=close;$("#scanResume").onclick=resume;$("#scanManual").onclick=manual;
 try{
   const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:1920}}});
   if(turn!==generation||closed){media.getTracks().forEach(t=>t.stop());return}
   stream=media;video.srcObject=stream;await video.play();
   if(turn===generation&&!closed){say("Cámara abierta. Centra una carta; el escáner seguirá buscando hasta reconocerla.");await startLive(turn)}
 }catch(e){say("No se pudo abrir la cámara: "+e.message+". Revisa permisos y HTTPS.")}
}
function close(){
 generation++;closed=true;locked=false;clearTimeout(timer);stopLive();
 if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
 if(video){video.pause();video.srcObject=null}video=null;
 if(ocrWorker){ocrWorker.terminate();ocrWorker=null}
 root()?.remove();
}
function init(){
 if(document.getElementById("scanLaunch"))return;
 const b=document.createElement("button");b.id="scanLaunch";b.textContent="📷 Escanear con IA";b.onclick=open;document.body.appendChild(b);
}
document.addEventListener("visibilitychange",()=>{
 if(document.hidden||!valid()||locked)return;
 if(source==="live"&&!liveBusy)scheduleLive(liveSerial,250);
 else if(source==="vision"&&!busy)plan(500);
});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();