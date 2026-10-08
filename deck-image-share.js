(()=>{
"use strict";
// One Piece deck JPG share: 6-column card collage, exact printings and red copy badges.
// This only reads deck/catalog data; collection quantities and Supabase are not modified.
const WIDTH=1800, COLUMNS=6, MARGIN=58, GAP=18, CARD_W=252, CARD_H=352, CAPTION=40;
const HEADER_H=183, ROW_H=412, FOOTER_H=102;
const cache=new Map();
let previewModal=null;
let previewUrl=null;
let busy=false;

function entriesForDeck(deck){
  const entries=[];
  if(deck?.leader){
    const leader=card(deck.leader);
    if(!leader)throw Error("No se encuentra el líder "+deck.leader+" en el catálogo.");
    entries.push({card:leader,count:1,leader:true});
  }
  for(const [id,qty] of Object.entries(deck?.cards||{})){
    const count=Number(qty);
    if(!Number.isSafeInteger(count)||count<=0)continue;
    const selected=card(id);
    if(!selected)throw Error("La carta "+id+" ya no está en el catálogo.");
    entries.push({card:selected,count,leader:false});
  }
  if(!entries.length)throw Error("Añade cartas al mazo antes de compartirlo.");
  // Leader first, then by card cost / name; keep each exact printing separate.
  return [entries[0]?.leader?entries[0]:null,...entries.slice(entries[0]?.leader?1:0).sort((a,b)=>{
    const ac=Number(a.card.cost),bc=Number(b.card.cost);
    const va=a.card.cost===null||a.card.cost===undefined?99:ac;
    const vb=b.card.cost===null||b.card.cost===undefined?99:bc;
    return va-vb||String(a.card.name||"").localeCompare(String(b.card.name||""),"es",{numeric:true})||
      String(a.card.id).localeCompare(String(b.card.id),"es",{numeric:true});
  })].filter(Boolean);
}

function cleanFilename(value){
  return String(value||"mazo").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9_-]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,55)||"mazo";
}
function clipText(ctx,text,maxWidth){
  let s=String(text||"");
  if(ctx.measureText(s).width<=maxWidth)return s;
  while(s.length>1&&ctx.measureText(s+"…").width>maxWidth)s=s.slice(0,-1);
  return s+"…";
}
function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
}
function imageToCanvas(ctx,image,x,y,w,h){
  const iw=image.width||image.naturalWidth,ih=image.height||image.naturalHeight;
  if(!iw||!ih)throw Error("La imagen no contiene píxeles.");
  const scale=Math.min(w/iw,h/ih);
  const dw=iw*scale,dh=ih*scale;
  ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
async function decodeImage(blob){
  if(typeof createImageBitmap==="function")return createImageBitmap(blob);
  const url=URL.createObjectURL(blob);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{
      img.onload=resolve;img.onerror=()=>reject(Error("Imagen ilegible."));
      img.src=url;
    });
    return img;
  }finally{URL.revokeObjectURL(url)}
}
async function loadCardArt(c){
  const sources=[imageCdnUrl(c),fallbackImageUrl(c),officialImageUrl(c)];
  let lastError;
  for(const url of new Set(sources.filter(Boolean))){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);
    try{
      const r=await fetch(url,{mode:"cors",cache:"force-cache",signal:ac.signal});
      if(!r.ok)throw Error("HTTP "+r.status);
      return await decodeImage(await r.blob());
    }catch(e){lastError=e}
    finally{clearTimeout(timer)}
  }
  throw Error("No se pudo descargar "+c.id+" ("+(lastError?.message||"sin imagen")+").");
}
function shield(ctx,cx,cy,count){
  const radius=43;
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.56)";ctx.shadowBlur=12;ctx.shadowOffsetY=6;
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const angle=Math.PI/3*i-Math.PI/6;
    const px=cx+radius*Math.cos(angle),py=cy+radius*Math.sin(angle);
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.closePath();
  const fill=ctx.createLinearGradient(cx,cy-radius,cx,cy+radius);
  fill.addColorStop(0,"#e83357");fill.addColorStop(1,"#ae1036");
  ctx.fillStyle=fill;ctx.fill();
  ctx.shadowColor="transparent";ctx.lineWidth=5;ctx.strokeStyle="#ff9dab";ctx.stroke();
  ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="900 48px system-ui,sans-serif";ctx.fillText(String(count),cx,cy+3);
  ctx.restore();
}
function drawCard(ctx,entry,image,index){
  const x=MARGIN+(index%COLUMNS)*(CARD_W+GAP);
  const y=HEADER_H+Math.floor(index/COLUMNS)*ROW_H;
  ctx.save();
  ctx.shadowColor="rgba(0,35,70,.38)";ctx.shadowBlur=15;ctx.shadowOffsetY=7;
  roundRect(ctx,x-4,y-4,CARD_W+8,CARD_H+CAPTION+8,14);
  ctx.fillStyle="#f9fbff";ctx.fill();ctx.restore();

  ctx.save();
  roundRect(ctx,x,y,CARD_W,CARD_H,9);ctx.clip();
  ctx.fillStyle="#122c46";ctx.fillRect(x,y,CARD_W,CARD_H);
  if(image){
    imageToCanvas(ctx,image,x,y,CARD_W,CARD_H);
  }else{
    ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.font="700 15px system-ui";
    ctx.fillText("IMAGEN NO DISPONIBLE",x+CARD_W/2,y+CARD_H/2);
  }
  ctx.restore();
  ctx.fillStyle="#0b2942";ctx.fillRect(x,y+CARD_H,CARD_W,CAPTION);
  ctx.font="700 17px system-ui";ctx.textAlign="center";ctx.fillStyle="#f5faff";
  ctx.fillText(clipText(ctx,entry.card.name||entry.card.id,CARD_W-12),x+CARD_W/2,y+CARD_H+21);
  ctx.font="600 12px system-ui";ctx.fillStyle="#a8d3ed";
  ctx.fillText(clipText(ctx,entry.card.id,CARD_W-15),x+CARD_W/2,y+CARD_H+36);
  shield(ctx,x+CARD_W/2,y+CARD_H-48,entry.count);
}
function drawHeader(ctx,deck,playCount,entryCount){
  const background=ctx.createLinearGradient(0,0,WIDTH,0);
  background.addColorStop(0,"#0076bd");background.addColorStop(.52,"#03b8ed");background.addColorStop(1,"#007aba");
  ctx.fillStyle=background;ctx.fillRect(0,0,WIDTH,ctx.canvas.height);
  const glow=ctx.createRadialGradient(WIDTH*.58,180,50,WIDTH*.58,180,WIDTH*.75);
  glow.addColorStop(0,"rgba(255,255,255,.12)");glow.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=glow;ctx.fillRect(0,0,WIDTH,ctx.canvas.height);
  ctx.fillStyle="rgba(2,31,71,.35)";ctx.fillRect(0,0,WIDTH,155);
  ctx.textAlign="left";ctx.textBaseline="alphabetic";
  ctx.fillStyle="#ffffff";ctx.font="900 30px system-ui,sans-serif";
  ctx.fillText("ONE PIECE  /  MIÁLBUMONEPIECE",MARGIN,47);
  ctx.font="900 67px system-ui,sans-serif";
  ctx.fillText(clipText(ctx,deck.name||"Mi mazo",1220),MARGIN,123);
  ctx.font="800 27px system-ui,sans-serif";ctx.textAlign="right";
  ctx.fillText(playCount+"/50 CARTAS",WIDTH-MARGIN,67);
  ctx.font="600 20px system-ui,sans-serif";
  ctx.fillText(entryCount+" IMPRESIONES · 1 LÍDER MÁX.",WIDTH-MARGIN,110);
}
async function makeJpg(deck,entries,onProgress){
  const rows=Math.ceil(entries.length/COLUMNS);
  const canvas=document.createElement("canvas");
  canvas.width=WIDTH;canvas.height=HEADER_H+rows*ROW_H+FOOTER_H;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("El navegador no puede generar la imagen JPG.");
  drawHeader(ctx,deck,Object.values(deck.cards||{}).reduce((s,n)=>s+Number(n||0),0),entries.length);
  let loaded=0,missing=[];
  // Bounded parallelism prevents an entire 50-card deck from flooding the network.
  const artworks=new Array(entries.length);
  let next=0;
  async function worker(){
    while(next<entries.length){
      const i=next++;
      try{artworks[i]=await loadCardArt(entries[i].card)}
      catch(e){missing.push(entries[i].card.id);console.warn("Deck JPG image",e)}
      loaded++;onProgress(loaded,entries.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(5,entries.length)},()=>worker()));
  for(let i=0;i<entries.length;i++){
    try{drawCard(ctx,entries[i],artworks[i],i)}
    finally{artworks[i]?.close?.()}
  }
  ctx.textAlign="center";ctx.font="700 24px system-ui,sans-serif";
  ctx.fillStyle="#ffffff";ctx.fillText("MIÁLBUMONEPIECE · LISTA PARA COMPARTIR",WIDTH/2,canvas.height-43);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("No se pudo convertir el mazo a JPG.")),"image/jpeg",.9));
  return {file:new File([blob],"mazo-"+cleanFilename(deck.name)+".jpg",{type:"image/jpeg"}),missing};
}

function saveFile(file){
  const url=URL.createObjectURL(file),a=document.createElement("a");
  a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function closePreview(){
  previewModal?.remove();previewModal=null;
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}
}
function showPreview(deck){
  closePreview();
  const dialog=document.createElement("div");
  dialog.className="modalback deck-share-modal";
  dialog.innerHTML='<div class="deck-share-dialog" role="dialog" aria-modal="true" aria-label="Compartir mazo en JPG">'+
    '<div class="sectionhead"><h2 style="margin:0">Compartir mazo (JPG)</h2><button class="close" data-jpg-close aria-label="Cerrar">×</button></div>'+
    '<p class="small">Imagen del mazo con el líder, las versiones exactas y las cantidades, lista para WhatsApp.</p>'+
    '<p class="deck-share-status" id="jpgShareStatus" aria-live="polite">Preparando imágenes…</p>'+
    '<img class="deck-share-preview" id="jpgSharePreview" alt="Vista previa del mazo en formato JPG" hidden>'+
    '<div class="deck-share-buttons"><button id="shareDeckJpgFile" class="primary btn" disabled>📤 Compartir JPG</button>'+
    '<button id="downloadDeckJpgFile" class="secondary btn" disabled>⬇ Guardar JPG</button></div></div>';
  document.body.appendChild(dialog);
  previewModal=dialog;
  dialog.querySelector("[data-jpg-close]").onclick=()=>closePreview();
  dialog.addEventListener("click",e=>{if(e.target===dialog)closePreview()});
  const status=dialog.querySelector("#jpgShareStatus");
  const share=dialog.querySelector("#shareDeckJpgFile"),download=dialog.querySelector("#downloadDeckJpgFile");
  return {dialog,status,share,download};
}
async function open(deck){
  if(busy)return;
  let entries;
  try{entries=entriesForDeck(deck)}
  catch(e){notify(e.message);return}
  const signature=JSON.stringify([deck.name,deck.leader,Object.entries(deck.cards||{}).sort()]);
  const ui=showPreview(deck);
  busy=true;
  try{
    let result=cache.get(signature);
    if(!result){
      result=await makeJpg(deck,entries,(done,total)=>{
        if(previewModal===ui.dialog)ui.status.textContent="Preparando cartas "+done+"/"+total+"…";
      });
      cache.set(signature,result);
      if(cache.size>3)cache.delete(cache.keys().next().value);
    }
    if(previewModal!==ui.dialog)return;
    const {file,missing}=result;
    previewUrl=URL.createObjectURL(file);
    ui.dialog.querySelector("#jpgSharePreview").src=previewUrl;
    ui.dialog.querySelector("#jpgSharePreview").hidden=false;
    ui.status.textContent=missing.length
      ?"Imagen lista; "+missing.length+" carta(s) no pudieron cargar su ilustración."
      :"Imagen JPG lista · "+entries.length+" impresiones · "+(file.size/1024/1024).toFixed(1)+" MB.";
    ui.share.disabled=false;ui.download.disabled=false;
    ui.download.onclick=()=>saveFile(file);
    ui.share.onclick=async()=>{
      if(typeof navigator.share!=="function"||(typeof navigator.canShare==="function"&&!navigator.canShare({files:[file]}))){
        saveFile(file);
        alert("Este navegador no permite compartir JPG directamente. Hemos guardado el archivo: envíalo desde WhatsApp como foto o documento.");
        return;
      }
      try{await navigator.share({files:[file],title:deck.name})}
      catch(e){
        if(e?.name==="AbortError")return;
        if(e?.name==="NotAllowedError"){ui.status.textContent="Pulsa «Compartir JPG» otra vez; la imagen ya está lista.";return}
        ui.status.textContent="No se pudo compartir directamente: "+(e?.message||"prueba a guardar el JPG.");
      }
    };
  }catch(e){
    console.warn("Compartir mazo JPG",e);
    if(previewModal===ui.dialog)ui.status.textContent="Error al generar JPG: "+(e?.message||"inténtalo de nuevo.");
  }finally{busy=false}
}
window.DeckImageShare={open};
})();