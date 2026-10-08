(()=>{
"use strict";
// 9 printable One Piece proxies per A4 page, 63 x 88 mm at actual size.
// Collection data is read-only. No stored deck or printing ID is changed.
const PAPER_MM={width:210,height:297};
const CARD_MM={width:63,height:88};
const GAP_MM=2;
const PER_PAGE=9;
const PHOTO_PIXELS={width:756,height:1056}; // ~305 DPI
const PDF_LIB_URL="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
let pdfLibPromise=null;
let generating=false;

function missingDeckProxies(deck){
  if(!state.user||!state.collectionReady){
    throw Error("Inicia sesión y espera a que termine de cargar tu colección antes de generar proxies.");
  }
  const missing=[];
  if(deck?.leader&&deckOwnedCopies(deck.leader)<1){
    const leader=card(deck.leader);
    if(!leader)throw Error("Falta la imagen del líder "+deck.leader+" en el catálogo.");
    missing.push(leader);
  }
  for(const group of deckCompositionGroups(deck)){
    const needed=Math.max(0,Math.ceil(group.count)-deckOwnedCopies(group.code));
    if(!needed)continue;
    const versions=state.cards.filter(c=>c.category!=="Leader"&&deckPrintedCode(c)===group.code);
    if(!versions.length)throw Error("No se encontró la imagen para "+group.code+".");
    // The normal, original-set printing is preferred; all ownership variants count.
    const source=catalogCoverCard({card:versions[0],versions})||versions[0];
    for(let i=0;i<needed;i++)missing.push(source);
  }
  return missing;
}

function loadPdfLib(){
  if(window.PDFLib)return Promise.resolve(window.PDFLib);
  if(pdfLibPromise)return pdfLibPromise;
  pdfLibPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=PDF_LIB_URL;
    script.async=true;
    script.onload=()=>window.PDFLib?resolve(window.PDFLib):reject(Error("No se pudo inicializar el generador de PDF."));
    script.onerror=()=>{script.remove();reject(Error("No se pudo descargar la librería PDF. Revisa la conexión."));};
    document.head.appendChild(script);
  }).catch(error=>{pdfLibPromise=null;throw error});
  return pdfLibPromise;
}

async function loadBitmap(blob){
  if(typeof createImageBitmap==="function")return createImageBitmap(blob);
  const url=URL.createObjectURL(blob);
  try{
    const image=new Image();
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(Error("Imagen ilegible"));
      image.src=url;
    });
    return image;
  }finally{URL.revokeObjectURL(url)}
}

async function fetchCardImageJpeg(c){
  const urls=[imageCdnUrl(c),fallbackImageUrl(c),officialImageUrl(c)];
  let error;
  for(const url of [...new Set(urls.filter(Boolean))]){
    const abort=new AbortController();
    const timeout=setTimeout(()=>abort.abort(),12000);
    try{
      const response=await fetch(url,{mode:"cors",cache:"force-cache",signal:abort.signal});
      if(!response.ok)throw Error("HTTP "+response.status);
      const bitmap=await loadBitmap(await response.blob());
      try{
        const canvas=document.createElement("canvas");
        canvas.width=PHOTO_PIXELS.width;canvas.height=PHOTO_PIXELS.height;
        const ctx=canvas.getContext("2d");
        if(!ctx)throw Error("Canvas no disponible");
        ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
        const w=bitmap.width||bitmap.naturalWidth,h=bitmap.height||bitmap.naturalHeight;
        if(!w||!h)throw Error("Imagen vacía");
        const scale=Math.min(canvas.width/w,canvas.height/h);
        const drawW=w*scale,drawH=h*scale;
        ctx.drawImage(bitmap,(canvas.width-drawW)/2,(canvas.height-drawH)/2,drawW,drawH);
        const jpeg=await new Promise((resolve,reject)=>
          canvas.toBlob(blob=>blob?resolve(blob):reject(Error("No se pudo convertir la imagen")),"image/jpeg",.92));
        return new Uint8Array(await jpeg.arrayBuffer());
      }finally{bitmap.close?.()}
    }catch(e){error=e}
    finally{clearTimeout(timeout)}
  }
  throw Error("No se pudo cargar la imagen de "+c.id+". "+(error?.message||"Prueba de nuevo."));
}

function proxyPdfPosition(index){
  const col=index%3,row=Math.floor(index/3)%3;
  const marginX=(PAPER_MM.width-CARD_MM.width*3-GAP_MM*2)/2;
  const marginY=(PAPER_MM.height-CARD_MM.height*3-GAP_MM*2)/2;
  return {x:mmToPt(marginX+col*(CARD_MM.width+GAP_MM)),
    y:mmToPt(PAPER_MM.height-marginY-CARD_MM.height-row*(CARD_MM.height+GAP_MM))};
}
function mmToPt(value){return value*72/25.4}

async function createProxyPdf(cards,button,title="Proxies de cartas - MiAlbumOnePiece"){
  const {PDFDocument,rgb}=await loadPdfLib();
  const pdf=await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setSubject("A4, 9 cartas por página, 63 x 88 mm, imprimir al 100%");
  const imageCache=new Map();
  let page;
  for(let i=0;i<cards.length;i++){
    if(i%PER_PAGE===0)page=pdf.addPage([mmToPt(PAPER_MM.width),mmToPt(PAPER_MM.height)]);
    const c=cards[i];
    let jpegImage=imageCache.get(c.id);
    if(!jpegImage){
      button.textContent="Preparando imágenes "+(i+1)+"/"+cards.length+"…";
      jpegImage=await pdf.embedJpg(await fetchCardImageJpeg(c));
      imageCache.set(c.id,jpegImage);
    }
    const pos=proxyPdfPosition(i);
    const dimensions={x:pos.x,y:pos.y,width:mmToPt(CARD_MM.width),height:mmToPt(CARD_MM.height)};
    page.drawImage(jpegImage,dimensions);
    page.drawRectangle({...dimensions,borderColor:rgb(.70,.70,.70),borderWidth:.25});
  }
  button.textContent="Creando PDF A4…";
  return pdf.save({useObjectStreams:true});
}

async function generateDeckProxies(button){
  if(generating)return;
  const d=state.decks.find(deck=>deck.id===state.deckId);
  if(!d){notify("Abre el mazo que quieres imprimir.");return}
  let cards;
  try{cards=missingDeckProxies(d)}
  catch(error){notify(error.message);return}
  if(!cards.length){notify("Ya tienes todas las cartas de este mazo; no necesitas proxies.");return}

  await openProxyPdf(cards,button,"Proxies de cartas faltantes - MiAlbumOnePiece");
}

async function generateStandaloneProxies(button){
  if(generating)return;
  const entries=Object.entries(state.proxySelection||{});
  const cards=[];
  for(const [id,count] of entries){
    const c=card(id),n=Number(count);
    if(!c||!Number.isSafeInteger(n)||n<=0||n>9999){notify("Hay una carta o cantidad inválida en la selección.");return}
    for(let i=0;i<n;i++)cards.push(c);
  }
  if(!cards.length){notify("Añade al menos una carta para crear el PDF.");return}
  if(cards.length>400&&!confirm("Vas a generar "+cards.length+" cartas ("+Math.ceil(cards.length/9)+" hojas A4). ¿Continuar?"))return;
  await openProxyPdf(cards,button,"Proxy Generator - MiAlbumOnePiece");
}

async function openProxyPdf(cards,button,title){
  if(generating)return;
  // Reserve the PDF tab within the actual click. Browsers block window.open
  // when called after awaiting image downloads or PDF generation.
  const pdfTab=window.open("about:blank","_blank");
  if(pdfTab){
    try{
      pdfTab.opener=null;
      pdfTab.document.title="Preparando PDF A4…";
      pdfTab.document.body.textContent="Generando proxies A4. El PDF aparecerá aquí en cuanto esté listo…";
    }catch{}
  }
  generating=true;
  const before=button.textContent;button.disabled=true;
  try{
    const bytes=await createProxyPdf(cards,button,title);
    const blob=new Blob([bytes],{type:"application/pdf"});
    const url=URL.createObjectURL(blob);
    // Display the PDF, not a forced download. If popups are blocked,
    // navigate to the viewer in this same browser tab.
    if(pdfTab&&!pdfTab.closed)pdfTab.location.replace(url);
    else window.location.assign(url);
    notify("PDF A4 abierto: "+cards.length+" proxies · "+Math.ceil(cards.length/PER_PAGE)+" hojas. Imprime al 100%.");
    // Keep the Blob URL valid for the duration of viewing/printing.
  }catch(error){
    if(pdfTab&&!pdfTab.closed)pdfTab.close();
    console.warn("Generador de proxies",error);
    alert("No se pudo generar el PDF completo: "+(error?.message||"error desconocido")+
      "\nNo se ha abierto un documento incompleto.");
  }finally{
    generating=false;button.disabled=false;button.textContent=before;
  }
}

// Delegation survives re-renders of the deck view, including cloud sync.
document.addEventListener("click",event=>{
  const button=event.target.closest?.("#generateDeckProxies, #generateStandaloneProxies");
  if(!button)return;
  if(button.id==="generateStandaloneProxies")generateStandaloneProxies(button);
  else generateDeckProxies(button);
});
})();
