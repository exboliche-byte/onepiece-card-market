(function historyClient(){
"use strict";
const PERIODS=[7,30,90,365],CACHE_MS=300000;
let days=30,revision=0,lastIdentity="",cached=new Map();
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString("es-ES",{style:"currency",currency:"EUR"}):"—";
const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const signed=v=>(v>0?"+":"")+fmt(v);
const dateLabel=s=>{const d=new Date(String(s)+"T12:00:00Z");return Number.isNaN(+d)?s:d.toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})};
const css=`
.history-toggle{border-top:1px solid var(--line);margin-top:15px;padding-top:9px}
.history-toggle>summary{cursor:pointer;padding:12px 3px;font-weight:800}
.history-body{padding:3px 0 15px}
.history-controls{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0 15px}
.history-controls button{padding:8px 11px;min-width:48px}
.history-controls button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
.history-summary{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:10px 0;font-weight:800}
.history-summary strong{font-size:clamp(18px,3vw,27px)}
.history-note{font-size:12px;color:var(--muted);line-height:1.5;margin:9px 0}
.history-chart{width:100%;height:auto;max-height:215px;display:block}
.history-line{fill:none;stroke:var(--accent);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.history-axis{stroke:var(--line);stroke-width:1.5}
.history-dates{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);gap:8px}
.history-movers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:15px 0}
.history-movers section{border:1px solid var(--line);border-radius:11px;padding:10px;min-width:0}
.history-movers h4{font-size:14px;margin:0 0 7px}
.history-mover{display:flex;justify-content:space-between;gap:9px;border-top:1px solid var(--line);padding:9px 0;font-size:12px}
.history-mover .muted{font-size:11px;color:var(--muted);margin-top:3px}
.history-mover .change{flex:none;text-align:right}
.history-up{color:var(--ok)}.history-down{color:var(--danger)}
@media(max-width:630px){.history-movers{grid-template-columns:1fr}}
`;
const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
function inventoryKey(){
 if(!state.user?.id||!state.collectionReady)return "";
 return state.user.id+"|"+Object.entries(state.owned||{}).filter(([,q])=>Number(q)>0)
  .sort((a,b)=>a[0].localeCompare(b[0])).map(([id,q])=>id+":"+q).join(";");
}
function buttons(){
 return '<div class="history-controls" role="group" aria-label="Periodo">'+PERIODS.map(n=>
 `<button class="secondary btn" type="button" data-history-days="${n}" aria-pressed="${n===days}">${n===365?"1 año":n+" días"}</button>`
 ).join("")+'</div>';
}
function graph(points){
 if(!points.length)return "";
 const w=720,h=195,l=6,r=714,t=12,b=176;
 const vs=points.map(p=>p.v),min=Math.min(...vs),max=Math.max(...vs);
 const pad=(max-min)*.1||Math.max(1,max*.03),bottom=Math.max(0,min-pad),top=max+pad;
 const dates=points.map(p=>Date.parse(p.day+"T12:00:00Z")),first=dates[0],last=dates.at(-1);
 const xy=points.map((p,i)=>{
  const x=l+(dates[i]-first)/Math.max(1,last-first)*(r-l);
  const y=b-(p.v-bottom)/Math.max(.01,top-bottom)*(b-t);
  return x.toFixed(1)+","+y.toFixed(1);
 }).join(" ");
 return `<svg class="history-chart" role="img" aria-label="Evolución del precio de las cartas que tienes" viewBox="0 0 ${w} ${h}"><line class="history-axis" x1="${l}" x2="${r}" y1="${b}" y2="${b}"/><polyline class="history-line" points="${xy}"/></svg>`+
 `<div class="history-dates"><span>${esc(dateLabel(points[0].day))} · ${fmt(points[0].v)}</span><span>${esc(dateLabel(points.at(-1).day))} · ${fmt(points.at(-1).v)}</span></div>`;
}
function moverList(rows,up){
 const items=rows.filter(m=>up?m.pct>0:m.pct<0).sort((a,b)=>up?b.pct-a.pct:a.pct-b.pct).slice(0,5);
 if(!items.length)return '<p class="history-note">Aún no hay variaciones para este periodo.</p>';
 return items.map(m=>{
  const cc=state.cards.find(c=>String(c.id).toLowerCase()===m.id);
  return `<div class="history-mover"><div><b>${esc(cc?.name||m.id.toUpperCase())}</b><div class="muted">${esc(m.id.toUpperCase())} · ${fmt(m.price)}/copia</div></div><div class="change ${up?"history-up":"history-down"}"><b>${m.pct>0?"+":""}${m.pct.toLocaleString("es-ES")}%</b><div class="muted">${signed(m.impact)} en tu colección</div></div></div>`;
 }).join("");
}
function render(data){
 const root=document.getElementById("collectionHistoryBody");
 if(!root||!document.getElementById("collectionHistoryToggle")?.open)return;
 const points=(data.history||[]).map(r=>({day:String(r.price_day||""),v:Number(r.total_eur),
  coverage:Number(r.priced_versions),owned:Number(r.owned_versions)}))
 .filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.day)&&Number.isFinite(p.v))
 .sort((a,b)=>a.day.localeCompare(b.day));
 const movers=(data.movers||[]).map(r=>({id:String(r.print_id||"").toLowerCase(),pct:Number(r.change_pct),price:Number(r.last_eur),impact:Number(r.impact_eur)}))
 .filter(m=>m.id&&Number.isFinite(m.pct)&&Number.isFinite(m.price)&&Number.isFinite(m.impact));
 const first=points[0],last=points.at(-1);
 const full=p=>p&&p.owned>0&&p.owned===p.coverage;
 const compare=points.length>=2&&points.every(full);
 const change=compare?last.v-first.v:null,pct=compare&&first.v>0?change/first.v*100:null;
 let message="";
 if(!points.length)message="Todavía no hay capturas diarias. Se registrarán automáticamente; las variaciones aparecen tras acumular al menos dos días.";
 else if(points.length===1)message="Primer día registrado. La evolución y las subidas/bajadas aparecerán con las siguientes capturas.";
 else if(!compare)message="Faltan precios de alguna impresión en ciertos días. No mostramos un porcentaje total engañoso.";
 else message="Cambio del valor de tus cartas actuales debido al mercado, sin contar compras o retiradas de la colección.";
 root.innerHTML=buttons()+
 (last?`<div class="history-summary"><strong>${fmt(last.v)}</strong>${pct!==null?`<span class="${change>=0?"history-up":"history-down"}">${signed(change)} (${pct>0?"+":""}${pct.toFixed(2).replace(".",",")}%)</span>`:"<span>Estimación parcial</span>"}</div>`:"")+
 graph(points)+`<p class="history-note">${esc(message)} ${last?"Último dato: "+esc(dateLabel(last.day))+". Versiones con precio: "+last.coverage+"/"+last.owned+".":""} Las cantidades utilizadas son las de tu colección actual.</p>`+
 `<div class="history-movers"><section><h4>↗ Cartas que más suben</h4>${moverList(movers,true)}</section><section><h4>↘ Cartas que más bajan</h4>${moverList(movers,false)}</section></div>`;
}
async function load(force=false){
 const root=document.getElementById("collectionHistoryBody");
 if(!root||!document.getElementById("collectionHistoryToggle")?.open)return;
 const id=inventoryKey();
 if(!id||!state.sb){root.innerHTML='<p class="history-note">Inicia sesión y carga tu colección para consultar su evolución.</p>';return;}
 if(id!==lastIdentity){revision++;cached.clear();lastIdentity=id;}
 const key=id+"|"+days,entry=cached.get(key);
 if(entry&&!force&&Date.now()-entry.at<CACHE_MS){render(entry.data);return;}
 const n=++revision,range=days;
 root.innerHTML=buttons()+'<p class="history-note">Cargando evolución de precios…</p>';
 try{
  const [h,m]=await Promise.all([state.sb.rpc("collection_market_history",{p_days:range}),state.sb.rpc("collection_market_movers",{p_days:range})]);
  if(h.error)throw h.error;if(m.error)throw m.error;
  if(n!==revision||inventoryKey()!==id||days!==range)return;
  const data={history:h.data||[],movers:m.data||[]};
  cached.set(key,{at:Date.now(),data});render(data);
 }catch(e){
  if(n!==revision||inventoryKey()!==id)return;
  console.warn("Evolución de colección no disponible",e?.message||e);
  root.innerHTML=buttons()+'<p class="history-note">No se pudo cargar el histórico de precios.</p><button class="secondary btn" type="button" data-history-retry>Reintentar</button>';
 }
}
document.addEventListener("toggle",e=>{if(e.target?.id==="collectionHistoryToggle"&&e.target.open)load()},true);
document.addEventListener("click",e=>{
 const ctl=e.target.closest?.("[data-history-days]");
 if(ctl&&PERIODS.includes(Number(ctl.dataset.historyDays))){days=Number(ctl.dataset.historyDays);load()}
 if(e.target.closest?.("[data-history-retry]"))load(true);
});
window.refreshCollectionHistory=()=>{if(document.getElementById("collectionHistoryToggle")?.open&&inventoryKey()!==lastIdentity)load()};
})();
