(()=>{
"use strict";
// One Piece deck JPG share: 6-column card collage, exact printings and red copy badges.
// This only reads deck/catalog data; collection quantities and Supabase are not modified.
const WIDTH=1800, COLUMNS=6, MARGIN=99, GAP=18, CARD_W=252, CARD_H=352, CAPTION=40;
const HEADER_H=183, ROW_H=412, FOOTER_H=240;
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
// Use the leader's printed color identity instead of sampling its illustration.
// This must work even when the leader image is unavailable or cross-origin.
const LEADER_PALETTE={
  red:[220,52,65],blue:[40,111,191],green:[33,147,101],
  purple:[131,81,186],black:[58,66,82],yellow:[221,169,35]
};
function deckLeaderColors(deck){
  const leader=deck?.leader?card(deck.leader):null;
  const raw=leader?.colors?.length?leader.colors:(deck?.colors||[]);
  const labels=(Array.isArray(raw)?raw:[raw]).flatMap(value=>String(value||"").split(/[,/;&+]/));
  const aliases={rojo:"red",azul:"blue",verde:"green",morado:"purple",violeta:"purple",negro:"black",amarillo:"yellow"};
  const colors=[],seen=new Set();
  for(const label of labels){
    const name=label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
    const key=aliases[name]||name;
    if(LEADER_PALETTE[key]&&!seen.has(key)){
      colors.push(LEADER_PALETTE[key]);seen.add(key);
    }
  }
  return colors.length?colors:[[65,101,133]];
}
function darkTint(color,factor,base){
  return "rgb("+color.map((v,i)=>Math.min(255,Math.round(v*factor+base[i]))).join(",")+")";
}

// Draw an original nautical chart over the actual leader-color background.
// Canvas-only art keeps the JPG fast, cross-origin safe and unique to each leader palette.
function drawNauticalChart(ctx){
  const w=WIDTH,h=ctx.canvas.height;
  ctx.save();
  // Seeded weathering: never flickers between repeated exports of the same deck.
  let seed=0x4f4e4550;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<780;i++){
    const x=random()*w,y=random()*h,r=1+random()*3;
    ctx.fillStyle=i%4?"rgba(242,220,165,.044)":"rgba(2,10,18,.10)";
    ctx.fillRect(x,y,r,r);
  }
  // Faded latitude/longitude grids and nautical bearing lines.
  ctx.strokeStyle="rgba(235,218,179,.115)";ctx.lineWidth=1.5;
  for(let x=130;x<w;x+=175){
    ctx.beginPath();ctx.moveTo(x,0);
    ctx.bezierCurveTo(x+70,h*.3,x-65,h*.68,x+15,h);ctx.stroke();
  }
  for(let y=195;y<h;y+=190){
    ctx.beginPath();ctx.moveTo(0,y);
    ctx.bezierCurveTo(w*.35,y-42,w*.7,y+47,w,y-6);ctx.stroke();
  }
  // Engraved island coastlines, drawn at several contour depths.
  function coast(cx,cy,rx,ry,phase){
    for(const depth of [1,.84,.69]){
      ctx.beginPath();
      for(let i=0;i<=76;i++){
        const a=i*Math.PI*2/76;
        const jag=1+.13*Math.sin(a*5+phase)+.075*Math.cos(a*11-phase)+.045*Math.sin(a*19+phase);
        const x=cx+Math.cos(a)*rx*jag*depth;
        const y=cy+Math.sin(a)*ry*jag*depth;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();
      if(depth===1){ctx.fillStyle="rgba(3,12,24,.17)";ctx.fill();}
      ctx.strokeStyle=depth===1?"rgba(225,198,132,.32)":"rgba(230,207,162,.13)";
      ctx.lineWidth=depth===1?3:1.6;ctx.stroke();
    }
  }
  coast(-65,h*.43,230,375,1.7);
  coast(w+85,h*.33,310,460,.9);
  coast(w*.83,h*.71,180,275,2.4);
  coast(w*.12,h*.88,320,290,.6);
  coast(w*.53,h*.53,92,135,1.2);
  // Compass rose with radial tick marks and engraved gold/ivory directional petals.
  function compass(cx,cy,rad,alpha){
    ctx.save();ctx.translate(cx,cy);ctx.rotate(-.1);ctx.globalAlpha=alpha;
    for(const r of [rad,rad*.94,rad*.76,rad*.38]){
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);
      ctx.lineWidth=r===rad?8:3;ctx.strokeStyle="rgba(238,219,167,.72)";ctx.stroke();
    }
    for(let i=0;i<72;i++){
      const a=(i*Math.PI/36)-Math.PI/2,major=i%6===0,inner=rad*(major?.77:.89);
      ctx.beginPath();ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);
      ctx.lineTo(Math.cos(a)*rad*.96,Math.sin(a)*rad*.96);
      ctx.lineWidth=major?3:1.4;ctx.strokeStyle="rgba(235,220,177,.76)";ctx.stroke();
    }
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4-Math.PI/2,spread=.13;
      ctx.beginPath();ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(a-spread)*rad*.19,Math.sin(a-spread)*rad*.19);
      ctx.lineTo(Math.cos(a)*(i%2?rad*.59:rad*.88),Math.sin(a)*(i%2?rad*.59:rad*.88));
      ctx.lineTo(Math.cos(a+spread)*rad*.19,Math.sin(a+spread)*rad*.19);
      ctx.closePath();
      ctx.fillStyle=i%2?"rgba(231,194,109,.43)":"rgba(242,229,192,.65)";
      ctx.fill();ctx.strokeStyle="rgba(2,18,30,.6)";ctx.lineWidth=2;ctx.stroke();
    }
    ctx.beginPath();ctx.arc(0,0,rad*.105,0,Math.PI*2);
    ctx.fillStyle="rgba(9,21,32,.67)";ctx.fill();ctx.strokeStyle="rgba(235,212,153,.75)";
    ctx.lineWidth=4;ctx.stroke();
    ctx.restore();
  }
  compass(w*.23,HEADER_H+(h-HEADER_H-FOOTER_H)*.43,Math.min(w*.31,h*.23),.42);
  compass(w*.76,HEADER_H*.57,104,.39);
  function route(x1,y1,cx,cy,x2,y2){
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(cx,cy,x2,y2);ctx.stroke();
  }
  ctx.save();ctx.lineWidth=2.2;ctx.strokeStyle="rgba(242,201,117,.38)";ctx.setLineDash([18,14]);
  route(-40,h*.23,w*.44,h*.07,w+20,h*.57);
  route(0,h*.91,w*.46,h*.56,w,h*.38);
  route(w*.12,h*.14,w*.63,h*.74,w*.92,h*.89);
  ctx.restore();
  // Navigation stars highlight the map without competing with card art.
  function navStar(x,y,r){
    ctx.save();ctx.translate(x,y);ctx.strokeStyle="rgba(242,210,132,.48)";ctx.lineWidth=2.4;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.2,Math.sin(a)*r*.2);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}
    ctx.beginPath();ctx.arc(0,0,r*.14,0,Math.PI*2);ctx.fillStyle="rgba(241,218,169,.7)";ctx.fill();ctx.restore();
  }
  navStar(w*.7,h*.28,38);navStar(w*.53,h*.79,31);navStar(w*.9,h*.56,28);
  // A subtle galleon silhouette on the ocean chart.
  ctx.save();ctx.translate(w*.72,h*.53);ctx.scale(1.2,1.2);
  ctx.strokeStyle="rgba(4,16,27,.42)";ctx.fillStyle="rgba(3,12,23,.21)";ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(-104,35);ctx.lineTo(105,35);ctx.lineTo(65,75);ctx.lineTo(-75,75);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,35);ctx.lineTo(0,-127);ctx.moveTo(-58,35);ctx.lineTo(-58,-85);ctx.moveTo(51,35);ctx.lineTo(51,-77);ctx.stroke();
  for(const [mx,my,top] of [[0,7,-110],[-58,14,-73],[51,17,-66]]){
    ctx.beginPath();ctx.moveTo(mx,my);ctx.quadraticCurveTo(mx+64,(my+top)/2,mx+7,top);ctx.lineTo(mx+7,my);ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.restore();
  // Antique gold edging similar to printed pirate charts, outside the text itself.
  ctx.fillStyle="rgba(214,166,68,.62)";
  ctx.fillRect(0,0,w,9);ctx.fillRect(0,HEADER_H-9,w,5);
  ctx.fillRect(0,h-FOOTER_H,w,7);ctx.fillRect(0,h-9,w,9);
  ctx.fillStyle="rgba(6,15,26,.6)";
  ctx.fillRect(0,9,w,3);ctx.fillRect(0,h-FOOTER_H+7,w,3);
  ctx.restore();
}
function drawHeader(ctx,deck,playCount,entryCount,leaderColors){
  const palette=leaderColors?.length?leaderColors:[[65,101,133]];
  // A single color keeps a consistent tone; multi-color leaders blend all their colors.
  const background=ctx.createLinearGradient(0,0,WIDTH,ctx.canvas.height);
  if(palette.length===1){
    background.addColorStop(0,darkTint(palette[0],.86,[10,13,18]));
    background.addColorStop(.65,darkTint(palette[0],.64,[9,12,17]));
    background.addColorStop(1,darkTint(palette[0],.45,[8,10,15]));
  }else palette.forEach((color,i)=>{
    background.addColorStop(i/(palette.length-1),darkTint(color,.83,[9,12,17]));
  });
  ctx.fillStyle=background;ctx.fillRect(0,0,WIDTH,ctx.canvas.height);
  palette.forEach((color,i)=>{
    const cx=palette.length===1?WIDTH*.55:WIDTH*(i+.5)/palette.length;
    const glow=ctx.createRadialGradient(cx,110,40,cx,110,WIDTH*.65);
    glow.addColorStop(0,"rgba("+color.join(",")+",.17)");
    glow.addColorStop(1,"rgba("+color.join(",")+",0)");
    ctx.fillStyle=glow;ctx.fillRect(0,0,WIDTH,ctx.canvas.height);
  });
  drawNauticalChart(ctx);
  ctx.fillStyle="rgba(0,0,0,.28)";ctx.fillRect(0,0,WIDTH,155);
  ctx.textAlign="left";ctx.textBaseline="alphabetic";
  ctx.fillStyle="#ffffff";ctx.font="900 30px system-ui,sans-serif";
  ctx.fillText("ONE PIECE  /  MIÁLBUMONEPIECE",MARGIN,47);
  ctx.font="900 67px system-ui,sans-serif";
  ctx.fillText(clipText(ctx,deck.name||"Mi mazo",1220),MARGIN,123);
  ctx.font="800 27px system-ui,sans-serif";ctx.textAlign="right";
  ctx.fillText(playCount+"/50 CARTAS",WIDTH-MARGIN,67);
  ctx.font="600 20px system-ui,sans-serif";
  ctx.fillText(entryCount+" IMPRESIONES · 1 LÍDER MÁX.",WIDTH-MARGIN,110);
  // Keep the decorative title frame crisp above the translucent header panel.
  ctx.fillStyle="rgba(225,185,103,.84)";ctx.fillRect(0,0,WIDTH,9);
  ctx.fillStyle="rgba(225,185,103,.55)";ctx.fillRect(0,153,WIDTH,5);
}
function drawDeckQRCode(ctx,url){
  if(typeof qrcode!=="function")throw Error("El generador QR no está disponible.");
  const qr=qrcode(0,"M");qr.addData(url);qr.make();
  const count=qr.getModuleCount();
  // Four-module quiet border; render integer pixel sizes to maintain scanner contrast.
  const pitch=Math.max(3,Math.floor(166/(count+8))),block=(count+8)*pitch;
  const x=WIDTH-MARGIN-block-12,y=ctx.canvas.height-FOOTER_H+(FOOTER_H-block)/2;
  ctx.save();
  ctx.fillStyle="#ffffff";roundRect(ctx,x-13,y-13,block+26,block+26,12);ctx.fill();
  ctx.fillStyle="#10141e";
  for(let row=0;row<count;row++)for(let col=0;col<count;col++){
    if(qr.isDark(row,col))ctx.fillRect(x+(col+4)*pitch,y+(row+4)*pitch,pitch,pitch);
  }
  ctx.restore();
}
async function makeJpg(deck,entries,onProgress,publicUrl){
  const rows=Math.ceil(entries.length/COLUMNS);
  const canvas=document.createElement("canvas");
  canvas.width=WIDTH;canvas.height=HEADER_H+rows*ROW_H+FOOTER_H;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("El navegador no puede generar la imagen JPG.");
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
  // Card art and its dominant colors never determine the background.
  drawHeader(ctx,deck,Object.values(deck.cards||{}).reduce((s,n)=>s+Number(n||0),0),entries.length,deckLeaderColors(deck));
  for(let i=0;i<entries.length;i++){
    try{drawCard(ctx,entries[i],artworks[i],i)}
    finally{artworks[i]?.close?.()}
  }
  drawDeckQRCode(ctx,publicUrl);
  ctx.textAlign="left";ctx.fillStyle="#ffffff";
  ctx.font="800 31px system-ui,sans-serif";
  ctx.fillText("ESCANEA EL QR PARA VER EL MAZO",MARGIN,canvas.height-133);
  ctx.font="600 21px system-ui,sans-serif";
  ctx.fillText("La lista completa está disponible en MiAlbumOnePiece",MARGIN,canvas.height-94);
  ctx.font="600 18px system-ui,sans-serif";
  ctx.fillText(clipText(ctx,publicUrl,WIDTH-590),MARGIN,canvas.height-56);
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
    '<button id="downloadDeckJpgFile" class="secondary btn" disabled>⬇ Guardar JPG</button>'+
    '<button id="copyDeckPublicLink" class="secondary btn" disabled>🔗 Copiar enlace al mazo</button></div></div>';
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
  const ui=showPreview(deck);
  busy=true;
  try{
    ui.status.textContent="Preparando el enlace público del mazo…";
    if(typeof window.preparePublicDeckShare!=="function")throw Error("Compartir mazos todavía no está disponible.");
    const publicUrl=await window.preparePublicDeckShare(deck);
    if(!publicUrl)throw Error("No se ha creado el enlace público.");
    const signature=JSON.stringify([deck.name,deck.description,deck.leader,Object.entries(deck.cards||{}).sort(),publicUrl]);
    let result=cache.get(signature);
    if(!result){
      result=await makeJpg(deck,entries,(done,total)=>{
        if(previewModal===ui.dialog)ui.status.textContent="Preparando cartas "+done+"/"+total+"…";
      },publicUrl);
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
    const copyLink=ui.dialog.querySelector("#copyDeckPublicLink");
    if(copyLink){
      copyLink.disabled=false;
      copyLink.onclick=async()=>{
        try{await navigator.clipboard.writeText(publicUrl);ui.status.textContent="Enlace del mazo copiado."}
        catch{ui.status.textContent="Enlace: "+publicUrl}
      };
    }
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