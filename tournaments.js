/* Torneos personales: datos independientes de la colección y de los mazos. */
(function(){
  "use strict";
  const TYPES=["Local Store","Extra Grand Battle","Store Championship","Treasure Cup","Regional","Online","Otro"];
  const KEY="mialbumonepiece_tournaments_";
  const roundTypes={swiss:"Suiza",topcut:"Top Cut",bye:"BYE",noshow:"No Show"};
  const styles=String.raw`
  .tourney-wrap{max-width:1020px;margin:auto;padding:16px 14px 95px}
  .tourney-header{display:flex;gap:10px;justify-content:space-between;align-items:center;margin:8px 0 18px}
  .tourney-header h1{margin:0;font-size:clamp(26px,6vw,38px)}
  .tourney-back{background:transparent;border:1px solid var(--line);border-radius:11px;color:var(--text);padding:9px 12px}
  .tourney-grid{display:grid;gap:12px}
  .tourney-tile{display:flex;align-items:center;gap:15px;border:1px solid var(--line);border-radius:19px;padding:14px;background:linear-gradient(105deg,#222731,#10151c);color:var(--text);text-align:left;width:100%;min-width:0}
  .tourney-tile:hover{border-color:var(--accent)}
  .tourney-portrait{width:94px;height:94px;flex:0 0 94px;border-radius:13px;object-fit:cover;object-position:top;background:#252c3c;border:1px solid #414758}
  .tourney-tile-info{min-width:0;flex:1}
  .tourney-tile-info strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:17px}
  .tourney-sub{color:var(--muted);font-size:12px;margin-top:5px}
  .tourney-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .tourney-pill{display:inline-flex;align-items:center;border:1px solid #697381;border-radius:7px;padding:4px 7px;color:#c9d1df;font-size:11px}
  .tourney-pill.green{color:var(--ok);border-color:#3e866d}
  .tourney-score{text-align:right;flex:0 0 78px;font-size:23px;font-weight:850}
  .tourney-score small{display:block;font-size:11px;font-weight:600;color:var(--muted);margin-top:7px}
  .tourney-panel{border:1px solid var(--line);border-radius:17px;padding:16px;background:var(--panel);margin-bottom:12px}
  .tourney-panel h2{margin:0 0 12px;font-size:20px}
  .tourney-field{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:750;margin-bottom:14px}
  .tourney-field .field{font-size:15px;color:var(--text)}
  .tourney-fields2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .tourney-selectrow{display:flex;gap:7px;overflow-x:auto;padding:3px 1px 11px}
  .tourney-selectrow button{flex:none;white-space:nowrap}
  .tourney-choice{border:1px solid #505b6b;border-radius:25px;background:transparent;color:var(--text);padding:9px 13px}
  .tourney-choice.active{border-color:#4a9476;background:#18382e;color:#94ebc2}
  .tourney-choice.result-active{background:#0c873e;border-color:#0c873e;color:white}
  .tourney-choice.loss-active{background:#ae343c;border-color:#ae343c;color:white}
  .tourney-leaders{display:grid;grid-template-columns:repeat(auto-fill,minmax(106px,1fr));gap:9px;max-height:390px;overflow:auto;padding:5px}
  .tourney-leader{border:1px solid var(--line);border-radius:12px;background:var(--panel2);color:var(--text);padding:8px;min-width:0;text-align:center}
  .tourney-leader.active{border-color:var(--accent);box-shadow:0 0 0 2px #ffd44755}
  .tourney-leader img{height:91px;width:82px;max-width:100%;object-fit:cover;object-position:top;border-radius:9px;display:block;margin:0 auto 7px}
  .tourney-leader b{font-size:11px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tourney-leader small{color:var(--muted);font-size:10px}
  .tourney-actions{display:flex;flex-wrap:wrap;gap:8px;margin:15px 0}
  .tourney-actions .btn{flex:1;min-width:125px}
  .tourney-hero{display:flex;align-items:center;gap:17px;flex-wrap:wrap}
  .tourney-hero .tourney-portrait{width:140px;height:140px;flex-basis:140px}
  .tourney-hero h2{font-size:27px;margin:8px 0}
  .tourney-rounds{display:grid;gap:12px}
  .tourney-round{border:1px solid var(--line);border-radius:15px;overflow:hidden;background:var(--panel2)}
  .tourney-round-main{display:flex;gap:10px;align-items:center;padding:12px}
  .tourney-round-main img{width:59px;height:59px;object-fit:cover;object-position:top;border-radius:8px;background:#293246}
  .tourney-round-name{flex:1;min-width:0;font-weight:800}
  .tourney-round-name strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tourney-round-name small{display:block;color:var(--muted);font-size:11px;margin-top:4px}
  .tourney-round-result{font-weight:850;border-radius:8px;padding:5px 9px}
  .tourney-round-result.win{border:1px solid #338658;color:#7bea9e}
  .tourney-round-result.loss{border:1px solid #893640;color:#ff96a3}
  .tourney-round-result.neutral{border:1px solid #4a5363;color:#c5cad3}
  .tourney-note{margin:0 12px 12px 33px;border-left:2px solid #697181;padding:8px 10px;color:#c7ccd5;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
  .tourney-round-footer{padding:0 12px 12px;display:flex;justify-content:end;gap:12px}
  .tourney-round-footer button{background:transparent;color:var(--muted);border:0;font-size:12px}
  .tourney-empty{text-align:center;color:var(--muted);padding:30px 12px;border:1px dashed var(--line);border-radius:16px}
  .tourney-dialogback{position:fixed;inset:0;z-index:60;background:#000a;display:grid;place-items:end center}
  .tourney-dialog{width:min(760px,100%);max-height:92dvh;overflow:auto;background:#10151d;border-radius:23px 23px 0 0;padding:20px 17px max(24px,env(safe-area-inset-bottom));border:1px solid var(--line)}
  .tourney-dialog h2{margin:4px 0 19px}
  .tourney-type-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .tourney-type-grid button{border:1px solid #4a5563;background:#151c25;border-radius:12px;color:var(--text);padding:20px 12px;text-align:left}
  .tourney-type-grid b{display:block;font-size:17px;margin-bottom:5px}
  .tourney-type-grid small{color:var(--muted);font-size:11px}
  .tourney-optionbar{display:flex;gap:8px}
  .tourney-optionbar button{flex:1;border:1px solid #444f61;border-radius:14px;background:#242830;color:var(--text);padding:12px}
  .tourney-optionbar button.selected{background:#087f3e;color:white;border-color:#087f3e}
  .tourney-optionbar button.negative{background:#9e353b;border-color:#9e353b}
  .tourney-muted{font-size:12px;color:var(--muted)}
  .tourney-hint{padding:10px;border:1px solid #434e5f;border-radius:11px;background:#18202b;color:var(--muted);font-size:12px}
  @media(max-width:500px){
    .tourney-fields2{grid-template-columns:1fr 1fr;gap:8px}
    .tourney-tile{gap:10px;padding:10px}
    .tourney-tile .tourney-portrait{width:72px;height:82px;flex-basis:72px}
    .tourney-score{flex-basis:60px;font-size:20px}
    .tourney-tile-info strong{font-size:15px}
    .tourney-hero .tourney-portrait{width:115px;height:115px;flex-basis:115px}
    .tourney-hero h2{font-size:21px}
    .tourney-round-main{gap:7px;padding:9px}
    .tourney-round-main img{width:49px;height:49px}
    .tourney-round-name{font-size:12px}
    .tourney-leaders{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
    .tourney-leader{padding:5px}
    .tourney-leader img{height:76px;width:65px}
    .tourney-leader b{font-size:9px}
  }`;
  const style=document.createElement("style");style.textContent=styles;document.head.appendChild(style);
  function ownerKey(){return state.user?.id?KEY+state.user.id:null}
  function getTournament(){return (state.tournaments||[]).find(t=>t.id===state.tournamentId)}
  function save(){const key=ownerKey();if(!key)return false;try{localStorage.setItem(key,JSON.stringify(state.tournaments));return true}catch(e){notify("No se pudo guardar: almacenamiento lleno");return false}}
  function load(){
    state.tournaments=[];state.tournamentId=null;state.tournamentDraft=null;state.tournamentRoundDraft=null;
    const key=ownerKey();if(!key)return;
    try{
      const data=JSON.parse(localStorage.getItem(key)||"[]");
      if(Array.isArray(data))state.tournaments=data.filter(t=>t&&typeof t.id==="string"&&Array.isArray(t.rounds)).slice(0,2000);
    }catch(e){console.warn("No se pudieron leer los torneos",e)}
  }
  function byId(id){return state.cards.find(c=>c.id===id)||state.cards.find(c=>c.id===baseId(id))||null}
  function portrait(id){const c=byId(id);return c?imageCdnUrl(c):""}
  function leaderName(id){return byId(id)?.name||id||"Sin líder"}
  function setName(id){return String(id||"").replace(/^(OP)(\d{2})$/i,"$1-$2")}
  function uniqueLeaders(query,set,alt){
    const map=new Map(),q=norm(query||"").trim(),selected=setName(set);
    for(const c of state.cards){
      if(c.category!=="Leader"&&c.rarity!=="Leader"&&c.rarity!=="L")continue;
      if(!alt&&c.id!==baseId(c.id))continue;
      if(q&&!norm(c.name+" "+c.id+" "+c.set).includes(q))continue;
      if(!q&&selected&&selected!=="Todas"&&!String(c.set||c.id).replace(/-/g,"").startsWith(selected.replace(/-/g,"")))continue;
      const key=alt?c.id:baseId(c.id);
      if(!map.has(key))map.set(key,c);
    }
    return [...map.values()].slice(0,q?60:24);
  }
  function leadersHtml(query,set,alt,chosen){
    const leaders=uniqueLeaders(query,set,alt);
    if(!leaders.length)return '<p class="tourney-muted">No se encontraron líderes. Busca por nombre o código.</p>';
    return leaders.map(c=>'<button type="button" class="tourney-leader'+(chosen===c.id?" active":"")+'" data-tourney-leader="'+esc(c.id)+'">'+cardImg(c,"tourney-leader-img")+'<b>'+esc(c.name)+'</b><small>'+esc(c.set||baseId(c.id))+'</small></button>').join("");
  }
  function choices(values,selected,attr){return values.map(v=>'<button type="button" class="tourney-choice'+(v===selected?" active":"")+'" '+attr+'="'+esc(v)+'">'+esc(v)+'</button>').join("")}
  function tournamentRecord(t){
    let wins=0,losses=0;
    for(const r of t.rounds||[]){if(r.result==="W")wins++;if(r.result==="L")losses++}
    return {wins,losses};
  }
  function dateLabel(v){
    if(!v)return "";
    const d=new Date(v+"T12:00:00");
    return Number.isNaN(+d)?v:d.toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"});
  }
  function tournamentList(){
    const arr=(state.tournaments||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
    return '<div class="tourney-wrap"><div class="tourney-header"><div><h1>🏆 Mis torneos</h1><div class="tourney-muted">Registra tus partidas, resultados y posiciones.</div></div><button class="primary btn" id="tourneyNew">＋ Nuevo</button></div>'+
      '<p class="tourney-hint">Los torneos se guardan en este dispositivo y en esta cuenta local. Para conservarlos o pasarlos a otro dispositivo, utiliza la copia de seguridad.</p>'+
      (arr.length?'<div class="tourney-grid">'+arr.map(t=>{const r=tournamentRecord(t);return '<button type="button" class="tourney-tile" data-tourney-open="'+esc(t.id)+'">'+
        (portrait(t.leaderId)?'<img class="tourney-portrait" src="'+esc(portrait(t.leaderId))+'" alt="">':'<div class="tourney-portrait"></div>')+
        '<div class="tourney-tile-info"><strong>'+esc(t.title)+'</strong><div class="tourney-sub">'+esc(dateLabel(t.date))+'</div><div class="tourney-pills"><span class="tourney-pill">'+esc(t.set||"Libre")+'</span><span class="tourney-pill green">'+esc(t.type||"Local Store")+'</span></div></div>'+
        '<div class="tourney-score">'+r.wins+' - '+r.losses+'<small>'+(t.placement?'#'+Number(t.placement):"—")+(t.players?' / '+Number(t.players):"")+'</small></div></button>'}).join("")+'</div>':
        '<div class="tourney-empty">Todavía no tienes torneos.<p>Crea el primero para ir registrando las rondas.</p></div>')+
      '<div class="tourney-actions"><button class="secondary btn" id="tourneyBackup">Exportar torneos (JSON)</button><button class="secondary btn" id="tourneyRestore">Importar copia</button><input hidden id="tourneyBackupInput" type="file" accept=".json,application/json"></div></div>';
  }
  function editingForm(){
    const d=state.tournamentDraft;
    const decks=state.decks.filter(x=>!x.draftCompetitive);
    const selectedDeck=decks.find(x=>x.id===d.deckId);
    const allSets=["OP-17","OP-16","OP-15","OP-14","OP-13","OP-12","OP-11","OP-10",...state.packs.map(p=>setName(p.code))].filter((v,i,a)=>a.indexOf(v)===i);
    return '<div class="tourney-wrap"><div class="tourney-header"><button class="tourney-back" id="tourneyFormBack">← Volver</button><h1>Nuevo torneo</h1></div>'+
      '<div class="tourney-panel"><label class="tourney-field">Nombre del torneo<input maxlength="100" class="field" id="tourneyTitle" placeholder="Ej. Torneo de tienda" value="'+esc(d.title||"")+'"></label>'+
      '<div class="tourney-muted" style="margin-bottom:8px">Tipo de torneo</div><div class="tourney-selectrow">'+choices(TYPES,d.type||"Local Store","data-tourney-type")+'</div>'+
      '<div class="tourney-fields2"><label class="tourney-field">Fecha<input class="field" type="date" id="tourneyDate" value="'+esc(d.date)+'"></label>'+
      '<label class="tourney-field">Set<select id="tourneySet" class="field"><option value="">Sin especificar</option>'+allSets.map(v=>'<option '+(d.set===v?"selected":"")+' value="'+esc(v)+'">'+esc(v)+'</option>').join("")+'</select></label></div>'+
      '<label class="tourney-field">Mi mazo (opcional)<select class="field" id="tourneyDeck"><option value="">Seleccionar líder manualmente</option>'+decks.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d.deckId?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label>'+
      (selectedDeck?'<div class="tourney-hint">Se usará el líder de «'+esc(selectedDeck.name)+'». Puedes cambiarlo manualmente abajo.</div>':'')+
      '<div class="tourney-fields2"><label class="tourney-field">Puesto final (opcional)<input class="field" type="number" inputmode="numeric" min="1" id="tourneyPlace" value="'+esc(d.placement||"")+'"></label>'+
      '<label class="tourney-field">Participantes (opcional)<input class="field" type="number" inputmode="numeric" min="1" id="tourneyPlayers" value="'+esc(d.players||"")+'"></label></div>'+
      '<div class="row"><h2 style="margin:10px 0">Líder jugado</h2><label class="tourney-muted"><input type="checkbox" id="tourneyAlt" '+(d.alt?"checked":"")+'> Incluir artes alternativos</label></div>'+
      '<input class="field" id="tourneyLeaderSearch" type="search" placeholder="Buscar líder por nombre o código" value="'+esc(d.search||"")+'" style="margin-bottom:10px"><div class="tourney-leaders" id="tourneyLeaderGrid">'+leadersHtml(d.search,d.set,d.alt,d.leaderId)+'</div>'+
      '<div class="tourney-actions"><button class="primary btn" id="tourneyCreate">Crear torneo</button></div></div></div>';
  }
  function detailsView(t){
    const r=tournamentRecord(t);
    return '<div class="tourney-wrap"><div class="tourney-header"><button class="tourney-back" id="tourneyBack">← Torneos</button><div style="text-align:right"><b>'+esc(t.title)+'</b><div class="tourney-sub">'+esc(dateLabel(t.date))+'</div></div></div>'+
      '<div class="tourney-panel"><div class="tourney-hero">'+(portrait(t.leaderId)?'<img class="tourney-portrait" alt="" src="'+esc(portrait(t.leaderId))+'">':'<div class="tourney-portrait"></div>')+
      '<div><div class="tourney-pills"><span class="tourney-pill">'+esc(t.set||"Set libre")+'</span><span class="tourney-pill green">'+esc(t.type)+'</span></div>'+
      '<h2>'+r.wins+' - '+r.losses+'</h2><div class="tourney-muted">'+esc(leaderName(t.leaderId))+'</div>'+
      '<div class="tourney-sub">'+(t.placement?'Puesto '+t.placement:"Sin clasificación")+(t.players?' de '+t.players+" jugadores":"")+'</div></div></div>'+
      '<div class="tourney-actions"><button class="secondary btn" id="tourneyEdit">Editar torneo</button><button class="primary btn" id="tourneyShare">📤 Compartir JPG</button></div>'+
      '<label class="tourney-muted"><input id="tourneyFinished" type="checkbox" '+(t.finished?"checked":"")+'> Torneo finalizado (puedes reabrirlo)</label></div>'+
      '<div class="tourney-header"><h2 style="margin:0">Rondas ('+t.rounds.length+')</h2>'+(t.finished?'':'<button class="primary btn" id="tourneyAddRound">＋ Añadir ronda</button>')+'</div>'+
      (t.rounds.length?'<div class="tourney-rounds">'+t.rounds.map((round,i)=>
        '<div class="tourney-round"><div class="tourney-round-main"><span class="tourney-muted">'+(i+1)+'</span>'+
        (portrait(round.opponentId)?'<img alt="" src="'+esc(portrait(round.opponentId))+'">':'<div style="width:59px">🏁</div>')+
        '<div class="tourney-round-name"><strong>'+esc(round.opponentId?leaderName(round.opponentId):roundTypes[round.kind]||"Ronda")+'</strong>'+
        '<small>'+esc(roundTypes[round.kind]||"Suiza")+(round.kind==="bye"||round.kind==="noshow"?"":' · '+(round.start==="1"?"Empecé 1º":"Empecé 2º")+' · Dados: '+(round.dice==="W"?"ganados":"perdidos"))+'</small></div>'+
        '<span class="tourney-round-result '+(round.result==="W"?"win":round.result==="L"?"loss":"neutral")+'">'+esc(round.result==="W"?"W":round.result==="L"?"L":"—")+'</span></div>'+
        (round.note?'<div class="tourney-note">'+esc(round.note)+'</div>':'')+
        (t.finished?"":'<div class="tourney-round-footer"><button data-tourney-edit-round="'+i+'">Editar</button><button data-tourney-delete-round="'+i+'">Eliminar</button></div>')+
        '</div>').join("")+'</div>':'<div class="tourney-empty">Añade rondas para calcular tu resultado automáticamente.</div>')+
      '<div class="tourney-actions"><button class="secondary btn" id="tourneyDelete">Eliminar torneo</button></div>'+
      (state.tournamentRoundDraft?roundDialog(t):"")+'</div>';
  }
  function roundDialog(t){
    const d=state.tournamentRoundDraft;
    if(!d.kind)return '<div class="tourney-dialogback" id="tourneyDialogBack"><div class="tourney-dialog"><h2>Selecciona el tipo de ronda</h2><div class="tourney-type-grid">'+
      Object.entries(roundTypes).map(([k,v])=>'<button data-tourney-round-kind="'+k+'"><b>'+esc(v)+'</b><small>'+esc(k==="swiss"?"Ronda habitual":k==="topcut"?"Eliminatoria al mejor de 3":k==="bye"?"Ronda libre / victoria automática":"Rival ausente; sin partida")+'</small></button>').join("")+
      '</div><button class="secondary btn" id="tourneyCancelRound" style="width:100%;margin-top:17px">Cancelar</button></div></div>';
    const special=d.kind==="bye"||d.kind==="noshow";
    return '<div class="tourney-dialogback"><div class="tourney-dialog"><div class="tourney-header"><h2>'+(d.editIndex===null?"Añadir":"Editar")+' ronda · '+esc(roundTypes[d.kind])+'</h2><button class="tourney-back" id="tourneyCancelRound">✕</button></div>'+
      (special?'<p class="tourney-hint">'+(d.kind==="bye"?"Un BYE cuenta como una victoria.":"No Show se registra sin sumar victoria ni derrota.")+'</p>':
      '<label class="tourney-field">Mazo del rival<input class="field" id="tourneyOpponentSearch" placeholder="Buscar líder rival" value="'+esc(d.search||"")+'"></label>'+
      '<div class="tourney-leaders" id="tourneyOpponentGrid">'+leadersHtml(d.search,"",true,d.opponentId)+'</div>'+
      '<div class="tourney-fields2" style="margin-top:15px"><div><p class="tourney-muted">Tirada de dados</p><div class="tourney-optionbar">'+toggle("dice","W","Gané",d.dice)+toggle("dice","L","Perdí",d.dice)+'</div></div>'+
      '<div><p class="tourney-muted">Inicio</p><div class="tourney-optionbar">'+toggle("start","1","1º",d.start)+toggle("start","2","2º",d.start)+'</div></div></div>'+
      '<p class="tourney-muted" style="margin-top:15px">Resultado</p><div class="tourney-optionbar">'+toggle("result","W","Victoria",d.result)+toggle("result","L","Derrota",d.result)+'</div>')+
      '<label class="tourney-field" style="margin-top:17px">Notas de la ronda (opcional)<textarea maxlength="1025" id="tourneyRoundNote" rows="3" class="field" placeholder="Qué funcionó, errores, jugadas clave...">'+esc(d.note||"")+'</textarea></label>'+
      '<div class="tourney-actions"><button class="secondary btn" id="tourneyCancelRound">Cancelar</button><button class="primary btn" id="tourneySaveRound">Guardar ronda</button></div></div></div>';
  }
  function toggle(field,value,label,current){
    return '<button type="button" data-tourney-toggle="'+field+'" data-value="'+value+'" class="'+(value===current?'selected'+(field==="result"&&value==="L"?" negative":""):"")+'">'+label+'</button>';
  }
  function view(){
    if(!state.user)return '<div class="tourney-wrap"><div class="tourney-header"><h1>🏆 Mis torneos</h1></div><div class="tourney-panel"><h2>Inicia sesión</h2><p>Necesitas una cuenta para registrar tus torneos.</p><button class="primary btn" id="tourneyLogin">Ir a mi cuenta</button></div></div>';
    if(state.tournamentDraft)return editingForm();
    const t=getTournament();
    return t?detailsView(t):tournamentList();
  }
  function captureForm(){
    const d=state.tournamentDraft;if(!d)return;
    d.title=document.querySelector("#tourneyTitle")?.value||d.title||"";
    d.date=document.querySelector("#tourneyDate")?.value||d.date;
    d.set=document.querySelector("#tourneySet")?.value??d.set;
    d.deckId=document.querySelector("#tourneyDeck")?.value??d.deckId;
    d.placement=document.querySelector("#tourneyPlace")?.value??d.placement;
    d.players=document.querySelector("#tourneyPlayers")?.value??d.players;
    d.search=document.querySelector("#tourneyLeaderSearch")?.value??d.search;
    d.alt=!!document.querySelector("#tourneyAlt")?.checked;
  }
  function captureRound(){
    const d=state.tournamentRoundDraft;if(d&&document.querySelector("#tourneyRoundNote"))d.note=document.querySelector("#tourneyRoundNote").value;
    if(d&&document.querySelector("#tourneyOpponentSearch"))d.search=document.querySelector("#tourneyOpponentSearch").value;
  }
  function rerender(){renderShell()}
  function exitForm(){state.tournamentDraft=null;rerender()}
  function saveTournament(){
    captureForm();const d=state.tournamentDraft;
    if(!d.title.trim()||!d.date){notify("Indica el nombre y la fecha");return}
    const deck=state.decks.find(x=>x.id===d.deckId);
    const leaderId=d.leaderId||deck?.leader||"";
    if(!leaderId){notify("Selecciona un líder");return}
    const players=Number(d.players),placement=Number(d.placement);
    if(d.players&&(!Number.isInteger(players)||players<1)||d.placement&&(!Number.isInteger(placement)||placement<1)){notify("Revisa puesto y participantes");return}
    if(d.players&&d.placement&&placement>players){notify("El puesto no puede superar los participantes");return}
    if(d.id){
      const t=state.tournaments.find(x=>x.id===d.id);if(!t)return;
      Object.assign(t,{title:d.title.trim(),date:d.date,set:d.set,type:d.type,leaderId,deckId:d.deckId||"",players:players||null,placement:placement||null,updatedAt:new Date().toISOString()});
    }else{
      const t={id:crypto.randomUUID(),title:d.title.trim(),date:d.date,set:d.set,type:d.type||"Local Store",leaderId,deckId:d.deckId||"",players:players||null,placement:placement||null,rounds:[],finished:false,createdAt:new Date().toISOString()};
      state.tournaments.unshift(t);state.tournamentId=t.id;
    }
    state.tournamentDraft=null;save();rerender();notify("Torneo guardado");
  }
  function selectRoundKind(kind){
    if(!roundTypes[kind])return;
    state.tournamentRoundDraft={...state.tournamentRoundDraft,kind,search:"",opponentId:"",dice:"W",start:"1",result:kind==="bye"?"W":kind==="noshow"?"N":"W",note:""};
    rerender();
  }
  function saveRound(){
    captureRound();const t=getTournament(),d=state.tournamentRoundDraft;if(!t||!d||t.finished)return;
    if(d.kind!=="bye"&&d.kind!=="noshow"&&!d.opponentId){notify("Selecciona el líder rival");return}
    const round={kind:d.kind,opponentId:d.opponentId||"",dice:d.dice,start:d.start,result:d.kind==="bye"?"W":d.kind==="noshow"?"N":d.result,note:String(d.note||"").slice(0,1025)};
    if(Number.isInteger(d.editIndex)&&d.editIndex>=0&&t.rounds[d.editIndex])t.rounds[d.editIndex]=round;
    else t.rounds.push(round);
    state.tournamentRoundDraft=null;t.updatedAt=new Date().toISOString();save();rerender();notify("Ronda guardada");
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  function backup(){
    const content=JSON.stringify({format:"mialbumonepiece-tournaments-v1",tournaments:state.tournaments},null,2);
    downloadBlob(new Blob([content],{type:"application/json"}),"mis-torneos-"+new Date().toISOString().slice(0,10)+".json");
  }
  async function restore(file){
    if(!file)return;
    try{
      const content=JSON.parse(await file.text());
      if(content?.format!=="mialbumonepiece-tournaments-v1"||!Array.isArray(content.tournaments))throw Error("Formato de copia no válido");
      if(content.tournaments.length>2000)throw Error("Demasiados torneos");
      if(!content.tournaments.every(t=>t&&typeof t.id==="string"&&typeof t.title==="string"&&Array.isArray(t.rounds)))throw Error("Datos de torneos incorrectos");
      if(!confirm("¿Importar "+content.tournaments.length+" torneos? Se combinarán con los existentes usando el identificador de cada torneo."))return;
      const merged=new Map(state.tournaments.map(t=>[t.id,t]));
      for(const t of content.tournaments)merged.set(t.id,t);
      state.tournaments=[...merged.values()];save();rerender();notify("Copia importada");
    }catch(e){alert("No se pudo importar: "+e.message)}
  }
  function truncate(ctx,str,max){
    let s=String(str||"");if(ctx.measureText(s).width<=max)return s;
    while(s.length&&ctx.measureText(s+"…").width>max)s=s.slice(0,-1);
    return s+"…";
  }
  function rounded(ctx,x,y,w,h,r,fill){
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  }
  function drawText(ctx,s,x,y,size,color,weight,max){
    ctx.font=(weight||"600")+" "+size+"px system-ui,Arial";ctx.fillStyle=color;
    ctx.fillText(max?truncate(ctx,s,max):String(s||""),x,y);
  }
  function loadPortrait(id){
    const cardInfo=byId(id);
    if(!cardInfo)return Promise.resolve(null);
    const candidates=[imageCdnUrl(cardInfo),fallbackImageUrl(cardInfo)];
    return new Promise(resolve=>{
      let index=0,done=false;
      const finish=image=>{if(done)return;done=true;clearTimeout(timeout);resolve(image)};
      const timeout=setTimeout(()=>finish(null),4500);
      const attempt=()=>{
        if(index>=candidates.length)return finish(null);
        const img=new Image();img.crossOrigin="anonymous";
        img.onload=()=>finish(img);
        img.onerror=()=>{index++;attempt()};
        img.src=candidates[index];
      };
      attempt();
    });
  }
  async function createShareJpg(t){
    const cv=document.createElement("canvas");cv.width=1080;cv.height=1350;const c=cv.getContext("2d");
    const grad=c.createLinearGradient(0,0,1080,1350);grad.addColorStop(0,"#1b2534");grad.addColorStop(1,"#080c14");c.fillStyle=grad;c.fillRect(0,0,1080,1350);
    rounded(c,40,34,1000,1282,28,"#111924");
    rounded(c,40,34,1000,12,6,"#ffd447");
    drawText(c,"MI ALBUM ONE PIECE",76,102,25,"#ffd447","800");
    drawText(c,"TOURNAMENT REPORT",76,159,44,"#ffffff","800");
    const record=tournamentRecord(t);
    const imgs=await Promise.all([loadPortrait(t.leaderId),...(t.rounds||[]).slice(0,7).map(r=>loadPortrait(r.opponentId))]);
    function paintAvatar(img,x,y,w,h){
      rounded(c,x,y,w,h,20,"#354152");
      if(!img)return;
      try{c.save();c.beginPath();c.roundRect(x,y,w,h,20);c.clip();const aspect=img.width/img.height,scale=Math.max(w/img.width,h/img.height);const iw=img.width*scale,ih=img.height*scale;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);c.restore()}catch(e){c.restore()}
    }
    paintAvatar(imgs[0],76,205,226,226);
    drawText(c,t.title,340,268,35,"#fff","800",630);
    drawText(c,dateLabel(t.date),340,317,26,"#bdc6d7","500");
    drawText(c,t.type+"  ·  "+(t.set||"Libre"),340,359,22,"#8bd8b0","650",650);
    drawText(c,leaderName(t.leaderId),340,403,23,"#cbd4e0","600",650);
    rounded(c,76,465,928,145,18,"#222e3c");
    drawText(c,"VICTORIAS / DERROTAS",106,506,21,"#a6b4c9","650");
    drawText(c,record.wins+" - "+record.losses,106,580,66,"#ffffff","850");
    drawText(c,t.placement?"PUESTO #"+t.placement:"SIN CLASIFICACIÓN",555,535,30,"#ffd447","800",430);
    drawText(c,t.players?"/ "+t.players+" participantes":"",557,578,22,"#bdc6d7","600");
    drawText(c,"RONDAS",77,667,27,"#ffffff","800");
    const rows=(t.rounds||[]).slice(0,7);
    let y=690;
    for(let i=0;i<rows.length;i++){
      const r=rows[i],height=68;rounded(c,76,y,928,height,12,i%2?"#1d2834":"#26313f");
      paintAvatar(imgs[i+1],91,y+6,56,56);
      drawText(c,(i+1)+".  "+(r.opponentId?leaderName(r.opponentId):roundTypes[r.kind]),164,y+42,22,"#ffffff","700",700);
      drawText(c,r.result==="W"?"W":r.result==="L"?"L":"—",933,y+43,28,r.result==="W"?"#77ef9d":r.result==="L"?"#ff8c9b":"#c1cad4","800");
      y+=76;
    }
    if(t.rounds.length>7)drawText(c,"+ "+(t.rounds.length-7)+" rondas más",85,Math.min(y+30,1270),20,"#b7c2d4","500");
    if(!rows.length)drawText(c,"Todavía no hay rondas registradas",83,744,22,"#9eacbd");
    drawText(c,"MiAlbumOnePiece · mis torneos",76,1280,22,"#9caabd","600");
    return new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error("No se pudo generar el JPG")),"image/jpeg",0.92));
  }
  async function share(t){
    const b=document.querySelector("#tourneyShare");if(b){b.disabled=true;b.textContent="Generando imagen…"}
    try{
      const blob=await createShareJpg(t),file=new File([blob],"torneo-"+t.date+".jpg",{type:"image/jpeg"});
      if(navigator.canShare?.({files:[file]})&&navigator.share){
        try{await navigator.share({files:[file],title:t.title,text:"Resultado de mi torneo de One Piece"});return}catch(e){if(e.name==="AbortError")return;console.warn(e)}
      }
      downloadBlob(blob,file.name);notify("JPG generado para compartir");
    }catch(e){console.warn(e);notify("No se pudo crear la imagen")}finally{if(b){b.disabled=false;b.textContent="📤 Compartir JPG"}}
  }
  function bind(){
    if(state.tab!=="tournaments")return;
    const on=(s,ev,f)=>document.querySelector(s)?.addEventListener(ev,f);
    on("#tourneyLogin","click",()=>navigateApp(()=>{state.tab="account"}));
    on("#tourneyNew","click",()=>{state.tournamentDraft={title:"",date:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),type:"Local Store",set:"OP-17",deckId:"",leaderId:"",alt:false,search:""};rerender()});
    document.querySelectorAll("[data-tourney-open]").forEach(b=>b.onclick=()=>navigateApp(()=>{state.tournamentId=b.dataset.tourneyOpen}));
    on("#tourneyFormBack","click",exitForm);
    on("#tourneyBack","click",()=>navigateApp(()=>{state.tournamentId=null;state.tournamentRoundDraft=null}));
    on("#tourneyBackup","click",backup);
    on("#tourneyRestore","click",()=>document.querySelector("#tourneyBackupInput")?.click());
    on("#tourneyBackupInput","change",e=>restore(e.target.files?.[0]));
    if(state.tournamentDraft){
      on("#tourneyCreate","click",saveTournament);
      document.querySelectorAll("[data-tourney-type]").forEach(b=>b.onclick=()=>{captureForm();state.tournamentDraft.type=b.dataset.tourneyType;rerender()});
      const refresh=()=>{captureForm();rerender()};
      on("#tourneySet","change",refresh);
      on("#tourneyDeck","change",()=>{captureForm();const deck=state.decks.find(x=>x.id===state.tournamentDraft.deckId);if(deck?.leader)state.tournamentDraft.leaderId=deck.leader;rerender()});
      on("#tourneyAlt","change",refresh);
      on("#tourneyLeaderSearch","input",e=>{
        state.tournamentDraft.search=e.target.value;
        const grid=document.querySelector("#tourneyLeaderGrid");if(grid){grid.innerHTML=leadersHtml(e.target.value,state.tournamentDraft.set,state.tournamentDraft.alt,state.tournamentDraft.leaderId);bindLeaderChoices(grid,state.tournamentDraft,false)}
      });
      bindLeaderChoices(document.querySelector("#tourneyLeaderGrid"),state.tournamentDraft,false);
      return;
    }
    const t=getTournament();if(!t)return;
    on("#tourneyEdit","click",()=>{state.tournamentDraft={...t,search:"",alt:false};rerender()});
    on("#tourneyShare","click",()=>share(t));
    on("#tourneyFinished","change",e=>{t.finished=e.target.checked;save();rerender()});
    on("#tourneyDelete","click",()=>{if(!confirm("¿Eliminar este torneo y todas sus rondas?"))return;state.tournaments=state.tournaments.filter(x=>x.id!==t.id);state.tournamentId=null;save();rerender();notify("Torneo eliminado")});
    on("#tourneyAddRound","click",()=>{state.tournamentRoundDraft={kind:null,editIndex:null};rerender()});
    document.querySelectorAll("[data-tourney-edit-round]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.tourneyEditRound);state.tournamentRoundDraft={...t.rounds[i],editIndex:i,search:""};rerender()});
    document.querySelectorAll("[data-tourney-delete-round]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.tourneyDeleteRound);if(!confirm("¿Eliminar la ronda "+(i+1)+"?"))return;t.rounds.splice(i,1);save();rerender()});
    if(!state.tournamentRoundDraft)return;
    document.querySelectorAll("[data-tourney-round-kind]").forEach(b=>b.onclick=()=>selectRoundKind(b.dataset.tourneyRoundKind));
    document.querySelectorAll("#tourneyCancelRound").forEach(b=>b.onclick=()=>{state.tournamentRoundDraft=null;rerender()});
    on("#tourneySaveRound","click",saveRound);
    document.querySelectorAll("[data-tourney-toggle]").forEach(b=>b.onclick=()=>{captureRound();state.tournamentRoundDraft[b.dataset.tourneyToggle]=b.dataset.value;rerender()});
    on("#tourneyOpponentSearch","input",e=>{
      state.tournamentRoundDraft.search=e.target.value;
      const grid=document.querySelector("#tourneyOpponentGrid");if(grid){grid.innerHTML=leadersHtml(e.target.value,"",true,state.tournamentRoundDraft.opponentId);bindLeaderChoices(grid,state.tournamentRoundDraft,true)}
    });
    bindLeaderChoices(document.querySelector("#tourneyOpponentGrid"),state.tournamentRoundDraft,true);
  }
  function bindLeaderChoices(grid,form,opponent){
    grid?.querySelectorAll("[data-tourney-leader]").forEach(b=>b.onclick=()=>{
      if(opponent)captureRound();else captureForm();
      form[opponent?"opponentId":"leaderId"]=b.dataset.tourneyLeader;
      rerender();
    });
  }
  window.tournamentsView=view;
  window.tournamentsBind=bind;
  window.tournamentsLoadForAccount=load;
})();
