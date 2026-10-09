/* Torneos personales: datos independientes de la colección y de los mazos. */
(function(){
  "use strict";
  const TYPES=["Local Store","Extra Grand Battle","Store Championship","Treasure Cup","Regional","Online","Otro"];
  const KEY="mialbumonepiece_tournaments_";
  const DELETED_KEY="mialbumonepiece_tournament_deleted_";
  let syncQueue=Promise.resolve();
  const getDeleted=id=>{try{return JSON.parse(localStorage.getItem(DELETED_KEY+id)||"{}")||{}}catch{return {}}};
  const timeOf=t=>String(t?.updatedAt||t?.createdAt||"1970-01-01T00:00:00.000Z");
  async function syncAccountTournaments(id){
    if(!id||state.user?.id!==id||!state.sb)return false;
    const response=await state.sb.from("tournaments").select("id,data,updated_at,deleted_at").eq("user_id",id);
    if(response.error)throw response.error;
    if(state.user?.id!==id)return false;
    const previous=localStorage.getItem(KEY+id)||"[]",local=JSON.parse(previous);
    const entries=new Map((Array.isArray(local)?local:[]).filter(t=>t?.id&&Array.isArray(t.rounds)).map(t=>[t.id,t]));
    const deleted=getDeleted(id),remote=new Map((response.data||[]).map(r=>[r.id,r])),toWrite=[];
    for(const [key,row] of remote){
      if(row.deleted_at){entries.delete(key);deleted[key]=row.deleted_at;continue}
      if(deleted[key]){entries.delete(key);toWrite.push({user_id:id,id:key,data:{},updated_at:deleted[key],deleted_at:deleted[key]});continue}
      const localRow=entries.get(key);
      if(!localRow||timeOf(localRow)<=String(row.updated_at||"")){
        if(row.data&&Array.isArray(row.data.rounds))entries.set(key,row.data);
      }else toWrite.push({user_id:id,id:key,data:localRow,updated_at:timeOf(localRow),deleted_at:null});
    }
    for(const [key,item] of entries)if(!remote.has(key)&&!deleted[key])
      toWrite.push({user_id:id,id:key,data:item,updated_at:timeOf(item),deleted_at:null});
    for(const [key,date] of Object.entries(deleted))if(!remote.has(key))
      toWrite.push({user_id:id,id:key,data:{},updated_at:date,deleted_at:date});
    for(let i=0;i<toWrite.length;i+=40){
      const result=await state.sb.from("tournaments").upsert(toWrite.slice(i,i+40),{onConflict:"user_id,id"});
      if(result.error)throw result.error;
      if(state.user?.id!==id)return false;
    }
    if(state.user?.id===id&&localStorage.getItem(KEY+id)===previous){
      state.tournaments=[...entries.values()];
      localStorage.setItem(KEY+id,JSON.stringify(state.tournaments));
      if(state.tab==="tournaments"&&!state.tournamentDraft&&!state.tournamentRoundDraft&&!state.tournamentFinishDraft)renderShell();
    }
    localStorage.setItem(DELETED_KEY+id,JSON.stringify(deleted));
    state.tournamentCloudError="";
    return true;
  }
  function syncTournaments(){
    const id=state.user?.id;if(!id||!state.sb)return Promise.resolve(false);
    syncQueue=syncQueue.catch(()=>{}).then(()=>syncAccountTournaments(id)).catch(e=>{
      console.warn("Tournaments cloud",e);
      if(state.user?.id===id){
        state.tournamentCloudError="No se han sincronizado los torneos: "+(e.message||e);
        if(state.tab==="tournaments")renderShell();
      }
      return false;
    });
    return syncQueue;
  }
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
  .tourney-round-badges{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 10px 30px}
  .tourney-round-badges span{font-size:11px;border:1px solid #45516a;border-radius:8px;padding:5px 7px;color:#d0dae7}
  .tourney-round-badges .good{border-color:#367b60;color:#79e1ad}
  .tourney-round-badges .bad{border-color:#814653;color:#ff9ca7}
  .tourney-stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0 18px}
  .tourney-stat-tile{border:1px solid var(--line);background:var(--panel2);border-radius:13px;padding:13px;min-width:0}
  .tourney-stat-tile strong{display:block;font-size:clamp(18px,2.4vw,25px);overflow-wrap:anywhere}
  .tourney-stat-tile span{font-size:11px;color:var(--muted);display:block;margin-top:3px}
  .tourney-stat-table{width:100%;border-collapse:collapse}
  .tourney-stat-table th,.tourney-stat-table td{padding:10px 7px;border-bottom:1px solid var(--line);text-align:left;font-size:12px}
  .tourney-stat-table th{color:var(--muted);font-weight:600}
  .tourney-stat-table td:last-child,.tourney-stat-table th:last-child{text-align:right}
  .tourney-stat-name{display:flex;gap:9px;align-items:center;min-width:0}
  .tourney-stat-name img{width:38px;height:52px;object-fit:cover;border-radius:5px;flex:none}
  .tourney-stat-name span{min-width:0;overflow-wrap:anywhere}
  .tourney-stat-panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .tourney-stat-panels>.tourney-panel{margin:0;min-width:0}
  .tourney-stat-tablescroll{overflow-x:auto}
  .tourney-inline-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:space-between;align-items:center}
  .tourney-header>.tourney-actions{margin:0;justify-content:end}
  .tourney-header>.tourney-actions .btn{min-width:0;flex:0 1 auto;padding:10px}
  @media(max-width:750px){.tourney-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tourney-stat-panels{grid-template-columns:1fr}}
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
  function save(deletedIds=[]){
    const key=ownerKey();if(!key)return false;
    try{
      const removed=getDeleted(state.user.id);
      for(const id of deletedIds)removed[id]=new Date().toISOString();
      localStorage.setItem(DELETED_KEY+state.user.id,JSON.stringify(removed));
      localStorage.setItem(key,JSON.stringify(state.tournaments));
      void syncTournaments();
      return true;
    }catch(e){notify("No se pudo conservar la modificación local");return false}
  }
  function load(){
    state.tournaments=[];state.tournamentId=null;state.tournamentDraft=null;state.tournamentRoundDraft=null;state.tournamentFinishDraft=null;state.tournamentStats=null;state.tournamentDeckOpen=false;state.tournamentCloudError="";
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
  // El líder rival se agrupa por carta lógica, conservando un único
  // representante: la impresión con menor precio de mercado disponible.
  function cheaperLeader(a,b){
    if(!a)return b;
    const pa=priceOf(a),pb=priceOf(b);
    if(pb!==null&&(pa===null||pb<pa))return b;
    if(pa!==null&&(pb===null||pa<pb))return a;
    const aBase=a.id===baseId(a.id),bBase=b.id===baseId(b.id);
    if(aBase!==bBase)return bBase?b:a;
    return String(a.id).localeCompare(String(b.id),"es",{numeric:true})<=0?a:b;
  }
  function cheapestLeader(id){
    if(!id)return null;
    const target=norm(baseId(id));
    let best=null;
    for(const c of state.cards){
      if(norm(baseId(c.id))!==target)continue;
      if(c.category!=="Leader"&&c.rarity!=="Leader"&&c.rarity!=="L")continue;
      best=cheaperLeader(best,c);
    }
    return best;
  }
  function uniqueLeaders(query,set,alt,cheapestOnly=false){
    const map=new Map(),q=norm(query||"").trim();
    for(const c of state.cards){
      if(c.category!=="Leader"&&c.rarity!=="Leader"&&c.rarity!=="L")continue;
      if(!cheapestOnly&&!alt&&c.id!==baseId(c.id))continue;
      const key=cheapestOnly?norm(baseId(c.id)):(alt?c.id:baseId(c.id));
      if(cheapestOnly)map.set(key,cheaperLeader(map.get(key),c));
      else if(!map.has(key))map.set(key,c);
    }
    return [...map.values()].filter(c=>{
      if(q&&!norm(c.name+" "+c.id+" "+baseId(c.id)+" "+c.set).includes(q))return false;
      return true;
    }).slice(0,q?100:200);
  }
  function leadersHtml(query,set,alt,chosen,cheapestOnly=false){
    const leaders=uniqueLeaders(query,set,alt,cheapestOnly);
    if(!leaders.length)return '<p class="tourney-muted">No se encontraron líderes. Busca por nombre o código.</p>';
    return leaders.map(c=>'<button type="button" class="tourney-leader'+((cheapestOnly?norm(baseId(chosen))===norm(baseId(c.id)):chosen===c.id)?" active":"")+'" data-tourney-leader="'+esc(c.id)+'">'+cardImg(c,"tourney-leader-img")+'<b>'+esc(c.name)+'</b><small>'+esc(c.set||baseId(c.id))+'</small></button>').join("");
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
    return '<div class="tourney-wrap"><div class="tourney-header"><div><h1>🏆 Mis torneos</h1><div class="tourney-muted">Registra tus partidas, resultados y posiciones.</div></div><div class="tourney-actions"><button class="secondary btn" id="tourneyStatsOpen">📊 Estadísticas</button><button class="secondary btn" id="tourneyCoachOpen">🎯 Preparar torneo</button><button class="primary btn" id="tourneyNew">＋ Nuevo</button></div></div>'+
      (state.tournamentCloudError?'<p class="tourney-hint">'+esc(state.tournamentCloudError)+'</p>':'')+
      (arr.length?'<div class="tourney-grid">'+arr.map(t=>{const r=tournamentRecord(t);return '<button type="button" class="tourney-tile" data-tourney-open="'+esc(t.id)+'">'+
        (portrait(t.leaderId)?'<img class="tourney-portrait" src="'+esc(portrait(t.leaderId))+'" alt="">':'<div class="tourney-portrait"></div>')+
        '<div class="tourney-tile-info"><strong>'+esc(t.title)+'</strong><div class="tourney-sub">'+esc(dateLabel(t.date))+'</div><div class="tourney-pills"><span class="tourney-pill">'+esc(t.set||"Libre")+'</span><span class="tourney-pill green">'+esc(t.type||"Local Store")+'</span></div></div>'+
        '<div class="tourney-score">'+r.wins+' - '+r.losses+'<small>'+(t.finished?(t.placement&&t.players?'#'+Number(t.placement)+' / '+Number(t.players):"Finalizado"):"En curso")+'</small></div></button>'}).join("")+'</div>':
        '<div class="tourney-empty">Todavía no tienes torneos.<p>Crea el primero para ir registrando las rondas.</p></div>')+'</div>';
  }
  // Las estadísticas de juego excluyen BYEs y No Shows para no inflar el win rate.
  // Los récords oficiales de un torneo conservan sus BYEs.
  function tournamentStatistics(tournaments){
    const result={tournaments:tournaments.length,completed:0,rounds:0,played:0,wins:0,losses:0,byes:0,noShows:0,notes:0,firstPlaces:0,podiums:0,placementSum:0,placementCount:0,playersSum:0,playersCount:0,streak:0,bestStreak:0,
      dice:{W:{wins:0,losses:0},L:{wins:0,losses:0}},
      start:{"1":{wins:0,losses:0},"2":{wins:0,losses:0}},
      kinds:new Map(),own:new Map(),opponents:new Map(),types:new Map()};
    const grouping=(map,key,label)=>{
      if(!map.has(key))map.set(key,{id:key,label,wins:0,losses:0,games:0});
      return map.get(key);
    };
    const add=(map,key,label,win)=>{
      const row=grouping(map,key,label);row.games++;if(win)row.wins++;else row.losses++;
    };
    for(const t of [...tournaments].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')))){
      if(t.finished){
        result.completed++;
        const place=Number(t.placement),players=Number(t.players);
        if(Number.isInteger(place)&&place>0){result.placementSum+=place;result.placementCount++;if(place===1)result.firstPlaces++;if(place<=3)result.podiums++}
        if(Number.isInteger(players)&&players>0){result.playersSum+=players;result.playersCount++}
      }
      const key=norm(baseId(t.leaderId||"desconocido"))||"desconocido";
      for(const round of t.rounds||[]){
        result.rounds++;
        if(String(round.note||"").trim())result.notes++;
        if(round.kind==="bye"){result.byes++;continue}
        if(round.kind==="noshow"){result.noShows++;continue}
        if(round.result!=="W"&&round.result!=="L")continue;
        const win=round.result==="W";
        result.played++;if(win){result.wins++;result.streak++;result.bestStreak=Math.max(result.bestStreak,result.streak)}else{result.losses++;result.streak=0}
        if(round.dice==="W"||round.dice==="L")result.dice[round.dice][win?"wins":"losses"]++;
        if(round.start==="1"||round.start==="2")result.start[round.start][win?"wins":"losses"]++;
        add(result.own,key,leaderName(t.leaderId),win);
        if(round.opponentId){
          const rival=norm(baseId(round.opponentId));
          add(result.opponents,rival,leaderName(round.opponentId),win);
        }
        add(result.kinds,round.kind||"swiss",roundTypes[round.kind]||"Suiza",win);
        add(result.types,t.type||"Otro",t.type||"Otro",win);
      }
    }
    return result;
  }
  function statsRate(w,l){const total=w+l;return total?(100*w/total).toLocaleString("es-ES",{maximumFractionDigits:1})+" %":"—"}
  function statsNumber(n){return Number(n||0).toLocaleString("es-ES",{maximumFractionDigits:1})}
  function statTile(number,label){return '<div class="tourney-stat-tile"><strong>'+esc(number)+'</strong><span>'+esc(label)+'</span></div>'}
  function statSection(title,content){
    return '<section class="tourney-panel"><h2>'+esc(title)+'</h2>'+content+'</section>';
  }
  function leaderboardTable(map,limit=15,withImages=false){
    const rows=[...map.values()].sort((a,b)=>b.games-a.games||b.wins-a.wins||String(a.label).localeCompare(String(b.label),"es")).slice(0,limit);
    if(!rows.length)return '<p class="tourney-muted">Sin partidas registradas.</p>';
    return '<div class="tourney-stat-tablescroll"><table class="tourney-stat-table"><thead><tr><th>Líder / categoría</th><th>W</th><th>L</th><th>W/R</th></tr></thead><tbody>'+
      rows.map(r=>'<tr><td><div class="tourney-stat-name">'+(withImages&&portrait(cheapestLeader(r.id)?.id||r.id)?'<img loading="lazy" src="'+esc(portrait(cheapestLeader(r.id)?.id||r.id))+'" alt="">':"")+
      '<span>'+esc(r.label)+' <span class="tourney-muted">('+r.games+')</span></span></div></td>'+
      '<td>'+r.wins+'</td><td>'+r.losses+'</td><td>'+esc(statsRate(r.wins,r.losses))+'</td></tr>').join("")+
      '</tbody></table></div>';
  }
  function statsHighlights(s){
    const rivals=[...s.opponents.values()];
    const topWins=rivals.filter(r=>r.wins>0).sort((a,b)=>b.wins-a.wins||b.games-a.games)[0];
    const topLosses=rivals.filter(r=>r.losses>0).sort((a,b)=>b.losses-a.losses||b.games-a.games)[0];
    const enough=rivals.filter(r=>r.games>=3);
    const highest=enough.slice().sort((a,b)=>b.wins/b.games-a.wins/a.games||b.games-a.games)[0];
    const lowest=enough.slice().sort((a,b)=>a.wins/a.games-b.wins/b.games||b.games-a.games)[0];
    const tile=(leader,title,metric)=>'<div class="tourney-stat-tile"><strong>'+esc(leader?leader.label:"—")+'</strong><span>'+esc(title+(leader?" · "+metric(leader):""))+'</span></div>';
    return '<div class="tourney-stats-grid">'+
      tile(topWins,"Rival al que más has ganado",x=>x.wins+" victorias")+
      tile(topLosses,"Rival que más te ha ganado",x=>x.losses+" derrotas")+
      tile(highest,"Mejor W/R vs. rival (mín. 3)",x=>statsRate(x.wins,x.losses))+
      tile(lowest,"Peor W/R vs. rival (mín. 3)",x=>statsRate(x.wins,x.losses))+
      '</div>';
  }
  function tournamentStatsView(only){
    const all=only?[only]:state.tournaments||[];
    const s=tournamentStatistics(all);
    return '<div class="tourney-wrap"><div class="tourney-header"><div><h1>📊 Estadísticas</h1><p class="tourney-muted">'+esc(only?only.title:"Historial de todos tus torneos")+'</p></div><button class="secondary btn" id="tourneyStatsBack">← Volver</button></div>'+
      '<p class="tourney-hint">El W/R se calcula sobre partidas jugadas (victorias / victorias + derrotas). Los BYEs y No Shows se muestran aparte y no alteran los porcentajes. Se utilizan los torneos sincronizados con tu cuenta.</p>'+
      '<div class="tourney-stats-grid">'+
      statTile(statsNumber(s.tournaments),"Torneos")+
      statTile(statsNumber(s.completed),"Torneos finalizados")+
      statTile(statsNumber(s.played),"Partidas jugadas")+
      statTile(statsRate(s.wins,s.losses),"W/R global")+
      statTile(statsNumber(s.wins),"Victorias jugadas")+
      statTile(statsNumber(s.losses),"Derrotas jugadas")+
      statTile(statsNumber(s.rounds),"Rondas totales")+
      statTile(statsNumber(s.byes),"BYEs")+
      statTile(statsNumber(s.noShows),"No Shows")+
      statTile(statsNumber(s.firstPlaces),"Primeros puestos")+
      statTile(statsNumber(s.podiums),"Top 3")+
      statTile(s.placementCount?statsNumber(s.placementSum/s.placementCount):"—","Posición media")+
      statTile(s.playersCount?statsNumber(s.playersSum/s.playersCount):"—","Participantes promedio")+
      statTile(s.tournaments?statsNumber(s.rounds/s.tournaments):"—","Rondas por torneo")+
      statTile(statsNumber(s.bestStreak),"Mejor racha de victorias")+
      statTile(statsNumber(s.notes),"Rondas con comentarios")+
      '</div>'+
      (s.played?statsHighlights(s):"")+
      '<div class="tourney-stat-panels">'+
      statSection("🎲 Tirada de dados",leaderboardTable(new Map(Object.entries(s.dice).map(([k,v])=>[k,{label:k==="W"?"Dado ganado":"Dado perdido",...v,games:v.wins+v.losses}]).filter(([k,v])=>v.games))))+
      statSection("🥇 Orden de salida",leaderboardTable(new Map(Object.entries(s.start).map(([k,v])=>[k,{label:k==="1"?"Salí primero":"Salí segundo",...v,games:v.wins+v.losses}]).filter(([k,v])=>v.games))))+
      statSection("🃏 Líderes que he jugado",leaderboardTable(s.own,30,true))+
      statSection("⚔️ Resultados por líder rival",leaderboardTable(s.opponents,60,true))+
      statSection("🏆 Tipo de torneo",leaderboardTable(s.types,20))+
      statSection("🔀 Tipo de ronda",leaderboardTable(s.kinds,10))+
      '</div></div>';
  }
  function editingForm(){
    const d=state.tournamentDraft;
    const decks=state.decks.filter(x=>!x.draftCompetitive);
    const selectedDeck=decks.find(x=>x.id===d.deckId);
    // Formats are set codes, not pack titles. New OP expansions appear automatically.
    const allSets=[...new Set((state.packs||[]).map(p=>{
      const raw=String(p.code||"").toUpperCase();
      const op=raw.match(/^OP-?(\d{2,3})(?:-EB-?\d{2})?$/);
      return op?"OP-"+op[1]:raw;
    }).filter(Boolean))].sort((a,b)=>{
      const x=a.match(/^OP-(\d+)$/),y=b.match(/^OP-(\d+)$/);
      if(x&&y)return Number(y[1])-Number(x[1]);
      if(x)return -1;if(y)return 1;
      return a.localeCompare(b,"es",{numeric:true});
    });
    if(d.set&&!allSets.includes(d.set))allSets.unshift(d.set);
    return '<div class="tourney-wrap"><div class="tourney-header"><button class="tourney-back" id="tourneyFormBack">← Volver</button><h1>'+(d.id?"Editar torneo":"Nuevo torneo")+'</h1></div>'+
      '<div class="tourney-panel"><label class="tourney-field">Nombre del torneo<input maxlength="100" class="field" id="tourneyTitle" placeholder="Un torneo (si lo dejas vacío)" value="'+esc(d.title||"")+'"></label>'+
      '<div class="tourney-muted" style="margin-bottom:8px">Tipo de torneo</div><div class="tourney-selectrow">'+choices(TYPES,d.type||"Local Store","data-tourney-type")+'</div>'+
      '<div class="tourney-fields2"><label class="tourney-field">Fecha<input class="field" type="date" id="tourneyDate" value="'+esc(d.date)+'"></label>'+
      '<label class="tourney-field">Set<select id="tourneySet" class="field"><option value="">Sin especificar</option>'+allSets.map(v=>'<option '+(d.set===v?"selected":"")+' value="'+esc(v)+'">'+esc(v)+'</option>').join("")+'</select></label></div>'+
      '<label class="tourney-field">Mi mazo (opcional)<select class="field" id="tourneyDeck"><option value="">Seleccionar líder manualmente</option>'+decks.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d.deckId?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label>'+
      (selectedDeck?'<div class="tourney-hint">Se utilizará el líder de «'+esc(selectedDeck.name)+'» y se guardará una copia del mazo.</div>':
      '<div class="row"><h2 style="margin:10px 0">Líder jugado</h2><label class="tourney-muted"><input type="checkbox" id="tourneyAlt" '+(d.alt?"checked":"")+'> Incluir artes alternativos</label></div>'+
      '<input class="field" id="tourneyLeaderSearch" type="search" placeholder="Buscar líder por nombre o código" value="'+esc(d.search||"")+'" style="margin-bottom:10px"><div class="tourney-leaders" id="tourneyLeaderGrid">'+leadersHtml(d.search,d.set,d.alt,d.leaderId)+'</div>')+
      '<div class="tourney-actions"><button class="primary btn" id="tourneyCreate">Crear torneo</button></div></div></div>';
  }
  function snapshotDeck(d){
    return d?{name:String(d.name||"Mazo"),description:String(d.description||""),leader:String(d.leader||""),cards:{...(d.cards||{})},colors:[...(d.colors||[])]}:null;
  }
  function deckModal(t){
    const d=t.deckSnapshot;
    if(!d)return '<div class="tourney-dialogback" id="tourneyDeckBackdrop"><div class="tourney-dialog"><h2>Lista no disponible</h2><p>Este torneo no conserva una copia de la lista utilizada.</p><button class="secondary btn" id="tourneyCloseDeck">Cerrar</button></div></div>';
    const items=Object.entries(d.cards||{}).filter(([,q])=>Number(q)>0).sort((a,b)=>(Number(byId(a[0])?.cost)||0)-(Number(byId(b[0])?.cost)||0)||a[0].localeCompare(b[0]));
    const entry=([id,q])=>{
      const c=byId(id);
      return '<div class="tourney-deck-card">'+(c?'<img src="'+esc(imageCdnUrl(c))+'" loading="lazy" alt="">':'')+'<div><b>'+esc(c?.name||id)+'</b><div class="tourney-muted">'+esc(id)+'</div></div><strong>×'+Number(q)+'</strong></div>';
    };
    return '<div class="tourney-dialogback" id="tourneyDeckBackdrop"><div class="tourney-dialog" role="dialog" aria-modal="true" aria-label="Lista del torneo"><div class="tourney-header"><h2 style="margin:0">'+esc(d.name||"Mazo del torneo")+'</h2><button class="secondary btn" id="tourneyCloseDeck">Cerrar</button></div><p class="tourney-muted">Copia guardada al registrar el mazo para este torneo.</p>'+(d.leader?'<h3>Líder</h3>'+entry([d.leader,1]):"")+'<h3>Cartas ('+items.reduce((n,[,q])=>n+Number(q),0)+')</h3><div class="tourney-deck-list">'+items.map(entry).join("")+'</div></div></div>';
  }
  function detailsView(t){
    const r=tournamentRecord(t);
    return '<div class="tourney-wrap"><div class="tourney-header"><button class="tourney-back" id="tourneyBack">← Torneos</button><div style="text-align:right"><b>'+esc(t.title)+'</b><div class="tourney-sub">'+esc(dateLabel(t.date))+'</div></div></div>'+
      '<div class="tourney-panel"><div class="tourney-hero"><button id="tourneyOpenDeck" type="button" class="tourney-leader-link" title="Ver lista jugada" aria-label="Ver lista jugada">'+(portrait(t.leaderId)?'<img class="tourney-portrait" alt="" src="'+esc(portrait(t.leaderId))+'">':'<div class="tourney-portrait"></div>')+'</button>'+
      '<div><div class="tourney-pills"><span class="tourney-pill">'+esc(t.set||"Set libre")+'</span><span class="tourney-pill green">'+esc(t.type)+'</span></div>'+
      '<h2>'+r.wins+' - '+r.losses+'</h2><div class="tourney-muted">'+esc(leaderName(t.leaderId))+'</div>'+
      '<div class="tourney-sub">'+(t.finished?(t.placement&&t.players?'Puesto '+t.placement+' de '+t.players+' jugadores':'Finalizado · Sin clasificación'):"Torneo en curso")+'</div></div></div>'+
      '<div class="tourney-actions"><button class="secondary btn" id="tourneyEdit">Editar torneo</button><button class="secondary btn" id="tourneyStatsOne">📊 Estadísticas</button><button class="primary btn" id="tourneyShare">📤 Compartir JPG</button></div>'+
      '<div class="tourney-actions">'+(t.finished?'<button class="secondary btn" id="tourneyReopen">↻ Reabrir torneo</button>':'<button class="primary btn" id="tourneyFinish">✓ Finalizar torneo</button>')+'</div></div>'+
      '<div class="tourney-header"><h2 style="margin:0">Rondas ('+t.rounds.length+')</h2><button class="danger btn" id="tourneyDelete">Eliminar torneo</button></div>'+
      (t.rounds.length?'<div class="tourney-rounds">'+t.rounds.map((round,i)=>
        '<div class="tourney-round"><div class="tourney-round-main"><span class="tourney-muted">'+(i+1)+'</span>'+
        (portrait(cheapestLeader(round.opponentId)?.id||round.opponentId)?'<img alt="" src="'+esc(portrait(cheapestLeader(round.opponentId)?.id||round.opponentId))+'">':'<div style="width:59px">🏁</div>')+
        '<div class="tourney-round-name"><strong>'+esc(round.opponentId?leaderName(round.opponentId):roundTypes[round.kind]||"Ronda")+'</strong>'+
        '<small>'+esc(roundTypes[round.kind]||"Suiza")+'</small></div>'+
        '<span class="tourney-round-result '+(round.result==="W"?"win":round.result==="L"?"loss":"neutral")+'">'+esc(round.result==="W"?"W":round.result==="L"?"L":"—")+'</span></div>'+
        (round.kind==="bye"||round.kind==="noshow"?"":'<div class="tourney-round-badges">'+
          (round.dice==="W"?'<span class="good">🎲 Gané dado</span>':round.dice==="L"?'<span class="bad">🎲 Perdí dado</span>':'')+
          (round.start==="1"?'<span>Salí primero</span>':round.start==="2"?'<span>Salí segundo</span>':'')+'</div>')+
        (round.note?'<div class="tourney-note"><b>Comentarios</b><div>'+esc(round.note)+'</div></div>':'')+
        (t.finished?"":'<div class="tourney-round-footer"><button data-tourney-edit-round="'+i+'">Editar</button><button data-tourney-delete-round="'+i+'">Eliminar</button></div>')+
        '</div>').join("")+'</div>':'<div class="tourney-empty">Añade rondas para calcular tu resultado automáticamente.</div>')+
      (t.finished?'':'<div class="tourney-actions"><button class="primary btn" id="tourneyAddRound">＋ Añadir ronda</button></div>')+
      (state.tournamentRoundDraft?roundDialog(t):"")+
      (state.tournamentFinishDraft?finishDialog(t):"")+'</div>';
  }
  function finishDialog(t){
    const d=state.tournamentFinishDraft;
    return '<div class="tourney-dialogback"><div class="tourney-dialog" role="dialog" aria-modal="true" aria-labelledby="tourneyFinishTitle">'+
      '<h2 id="tourneyFinishTitle">Finalizar torneo</h2>'+
      '<p class="tourney-muted">Puedes finalizar sin clasificación y completarla más adelante.</p>'+
      '<div class="tourney-fields2"><label class="tourney-field">Puesto final<input class="field" type="number" inputmode="numeric" min="1" step="1" id="tourneyFinalPlace" placeholder="Ej. 5" value="'+esc(d.placement??"")+'"></label>'+
      '<label class="tourney-field">Participantes<input class="field" type="number" inputmode="numeric" min="1" step="1" id="tourneyFinalPlayers" placeholder="Ej. 20" value="'+esc(d.players??"")+'"></label></div>'+
      '<div class="tourney-actions"><button class="secondary btn" id="tourneyCancelFinish">Cancelar</button><button class="primary btn" id="tourneyConfirmFinish">Guardar y finalizar</button></div>'+
      '</div></div>';
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
      '<div class="tourney-leaders" id="tourneyOpponentGrid">'+leadersHtml(d.search,"",true,d.opponentId,true)+'</div>'+
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
    if(state.tournamentCoachOpen)return '<div class="tourney-wrap"><div class="tourney-header"><h1>🎯 Preparar torneo</h1><button class="secondary btn" id="tourneyCoachBack">← Mis torneos</button></div>'+(window.OnePieceTools?.coachView?.()||"")+"</div>";
    const t=getTournament();
    if(state.tournamentStats)return tournamentStatsView(state.tournamentStats==="all"?null:t);
    return t?detailsView(t)+(state.tournamentDeckOpen?deckModal(t):""):tournamentList();
  }
  function captureForm(){
    const d=state.tournamentDraft;if(!d)return;
    d.title=document.querySelector("#tourneyTitle")?.value??d.title??"";
    d.date=document.querySelector("#tourneyDate")?.value||d.date;
    d.set=document.querySelector("#tourneySet")?.value??d.set;
    d.deckId=document.querySelector("#tourneyDeck")?.value??d.deckId;
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
    if(!d.date){notify("Indica la fecha del torneo");return}
    const deck=state.decks.find(x=>x.id===d.deckId);
    const leaderId=deck?.leader||d.leaderId||"";
    if(!leaderId){notify("Selecciona un líder");return}
    if(d.id){
      const t=state.tournaments.find(x=>x.id===d.id);if(!t)return;
      Object.assign(t,{title:d.title.trim()||"Un torneo",date:d.date,set:d.set,type:d.type,leaderId,deckId:d.deckId||"",deckSnapshot:deck?(t.deckId===d.deckId&&t.deckSnapshot?t.deckSnapshot:snapshotDeck(deck)):null,updatedAt:new Date().toISOString()});
    }else{
      const t={id:crypto.randomUUID(),title:d.title.trim()||"Un torneo",date:d.date,set:d.set,type:d.type||"Local Store",leaderId,deckId:d.deckId||"",deckSnapshot:snapshotDeck(deck),players:null,placement:null,rounds:[],finished:false,createdAt:new Date().toISOString()};
      state.tournaments.unshift(t);state.tournamentId=t.id;
    }
    state.tournamentDraft=null;save();rerender();notify("Torneo registrado; sincronizando…");
  }
  function confirmFinish(){
    const t=getTournament();
    if(!t||t.finished||!state.tournamentFinishDraft)return;
    const placeRaw=String(document.querySelector("#tourneyFinalPlace")?.value??"").trim();
    const playersRaw=String(document.querySelector("#tourneyFinalPlayers")?.value??"").trim();
    const placement=Number(placeRaw),players=Number(playersRaw);
    if((placeRaw&&(!Number.isSafeInteger(placement)||placement<1))||(playersRaw&&(!Number.isSafeInteger(players)||players<1))){notify("Introduce números enteros válidos");return}
    if(placeRaw&&playersRaw&&placement>players){notify("El puesto no puede superar el número de participantes");return}
    t.placement=placeRaw?placement:null;t.players=playersRaw?players:null;t.finished=true;t.updatedAt=new Date().toISOString();
    state.tournamentFinishDraft=null;save();rerender();notify("Torneo finalizado; sincronizando…");
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
    state.tournamentRoundDraft=null;t.updatedAt=new Date().toISOString();save();rerender();notify("Ronda registrada; sincronizando…");
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
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
    const rounds=t.rounds||[];
    const rowTop=690,rowStep=100,rowHeight=90;
    // Una ronda por fila y altura adaptable: no recortar resultados al compartir.
    const height=Math.max(1350,rowTop+Math.max(rounds.length,1)*rowStep+135);
    const cv=document.createElement("canvas");cv.width=1080;cv.height=height;const c=cv.getContext("2d");
    const grad=c.createLinearGradient(0,0,1080,height);grad.addColorStop(0,"#1b2534");grad.addColorStop(1,"#080c14");c.fillStyle=grad;c.fillRect(0,0,1080,height);
    rounded(c,40,34,1000,height-68,28,"#111924");
    rounded(c,40,34,1000,12,6,"#ffd447");
    drawText(c,"MI ALBUM ONE PIECE",76,102,25,"#ffd447","800");
    drawText(c,"TOURNAMENT REPORT",76,159,44,"#ffffff","800");
    const record=tournamentRecord(t);
    const imgs=await Promise.all([loadPortrait(t.leaderId),...rounds.map(r=>loadPortrait(cheapestLeader(r.opponentId)?.id||r.opponentId))]);
    function paintAvatar(img,x,y,w,h){
      rounded(c,x,y,w,h,20,"#354152");
      if(!img)return;
      try{c.save();c.beginPath();c.roundRect(x,y,w,h,20);c.clip();const scale=Math.max(w/img.width,h/img.height);const iw=img.width*scale,ih=img.height*scale;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);c.restore()}catch(e){c.restore()}
    }
    paintAvatar(imgs[0],76,205,226,226);
    drawText(c,t.title,340,268,35,"#fff","800",630);
    drawText(c,dateLabel(t.date),340,317,26,"#bdc6d7","500");
    drawText(c,t.type+"  ·  "+(t.set||"Libre"),340,359,22,"#8bd8b0","650",650);
    drawText(c,leaderName(t.leaderId),340,403,23,"#cbd4e0","600",650);
    rounded(c,76,465,928,145,18,"#222e3c");
    drawText(c,"VICTORIAS / DERROTAS",106,506,21,"#a6b4c9","650");
    drawText(c,record.wins+" - "+record.losses,106,580,66,"#ffffff","850");
    drawText(c,t.finished?(t.placement?"PUESTO #"+t.placement:"FINALIZADO"):"EN CURSO",555,535,30,"#ffd447","800",430);
    drawText(c,t.finished&&t.players?"/ "+t.players+" participantes":"",557,578,22,"#bdc6d7","600");
    drawText(c,"RONDAS",77,667,27,"#ffffff","800");
    for(let i=0;i<rounds.length;i++){
      const r=rounds[i],y=rowTop+i*rowStep;
      rounded(c,76,y,928,rowHeight,12,i%2?"#1d2834":"#26313f");
      paintAvatar(imgs[i+1],91,y+13,64,64);
      drawText(c,(i+1)+".  "+(r.opponentId?leaderName(r.opponentId):roundTypes[r.kind]||"Ronda"),171,y+35,22,"#ffffff","700",675);
      const details=[roundTypes[r.kind]||"Suiza"];
      if(r.kind!=="bye"&&r.kind!=="noshow"){
        if(r.dice==="W")details.push("Gané dado");
        else if(r.dice==="L")details.push("Perdí dado");
        if(r.start==="1")details.push("Salí primero");
        else if(r.start==="2")details.push("Salí segundo");
      }
      drawText(c,details.join("  ·  "),171,y+67,19,"#a9c9dd","600",670);
      const result=r.result==="W"?"VICTORIA":r.result==="L"?"DERROTA":"—";
      drawText(c,result,863,y+54,19,r.result==="W"?"#77ef9d":r.result==="L"?"#ff8c9b":"#c1cad4","800",127);
    }
    if(!rounds.length)drawText(c,"Todavía no hay rondas registradas",83,744,22,"#9eacbd");
    drawText(c,"MiAlbumOnePiece · mis torneos",76,height-70,22,"#9caabd","600");
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
    on("#tourneyStatsOpen","click",()=>{state.tournamentStats="all";rerender()});
    on("#tourneyCoachOpen","click",()=>{state.tournamentCoachOpen=true;rerender()});
    on("#tourneyCoachBack","click",()=>{state.tournamentCoachOpen=false;rerender()});
    if(state.tournamentCoachOpen){window.OnePieceTools?.bindCoach?.();return;}
    on("#tourneyStatsBack","click",()=>{state.tournamentStats=null;rerender()});
    on("#tourneyNew","click",()=>{state.tournamentDraft={title:"",date:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),type:"Local Store",set:(state.packs||[]).map(p=>String(p.code||"").toUpperCase().match(/^OP-?(\d{2,3})(?:-EB-?\d{2})?$/)?.[1]).filter(Boolean).sort((a,b)=>Number(b)-Number(a)).map(n=>"OP-"+n)[0]||"",deckId:"",leaderId:"",alt:false,search:""};rerender()});
    document.querySelectorAll("[data-tourney-open]").forEach(b=>b.onclick=()=>navigateApp(()=>{state.tournamentId=b.dataset.tourneyOpen}));
    on("#tourneyFormBack","click",exitForm);
    on("#tourneyBack","click",()=>navigateApp(()=>{state.tournamentId=null;state.tournamentDeckOpen=false;state.tournamentRoundDraft=null;state.tournamentFinishDraft=null}));
    if(state.tournamentDraft){
      on("#tourneyCreate","click",saveTournament);
      document.querySelectorAll("[data-tourney-type]").forEach(b=>b.onclick=()=>{captureForm();state.tournamentDraft.type=b.dataset.tourneyType;rerender()});
      const refresh=()=>{captureForm();rerender()};
      on("#tourneySet","change",refresh);
      on("#tourneyDeck","change",()=>{captureForm();const deck=state.decks.find(x=>x.id===state.tournamentDraft.deckId);state.tournamentDraft.leaderId=deck?.leader||"";rerender()});
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
    on("#tourneyOpenDeck","click",()=>{state.tournamentDeckOpen=true;rerender()});
    on("#tourneyCloseDeck","click",()=>{state.tournamentDeckOpen=false;rerender()});
    on("#tourneyDeckBackdrop","click",e=>{if(e.target.id==="tourneyDeckBackdrop"){state.tournamentDeckOpen=false;rerender()}});
    on("#tourneyStatsOne","click",()=>{state.tournamentStats=t.id;rerender()});
    on("#tourneyFinish","click",()=>{if(t.finished)return;state.tournamentFinishDraft={placement:t.placement||"",players:t.players||""};rerender()});
    on("#tourneyReopen","click",()=>{if(!t.finished)return;t.finished=false;t.updatedAt=new Date().toISOString();state.tournamentFinishDraft=null;save();rerender();notify("Torneo reabierto; sincronizando…")});
    on("#tourneyCancelFinish","click",()=>{state.tournamentFinishDraft=null;rerender()});
    on("#tourneyConfirmFinish","click",confirmFinish);
    on("#tourneyDelete","click",()=>{if(!confirm("¿Eliminar este torneo y todas sus rondas?"))return;state.tournaments=state.tournaments.filter(x=>x.id!==t.id);state.tournamentId=null;save([t.id]);rerender();notify("Torneo eliminado")});
    on("#tourneyAddRound","click",()=>{state.tournamentRoundDraft={kind:null,editIndex:null};rerender()});
    document.querySelectorAll("[data-tourney-edit-round]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.tourneyEditRound);state.tournamentRoundDraft={...t.rounds[i],editIndex:i,search:""};rerender()});
    document.querySelectorAll("[data-tourney-delete-round]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.tourneyDeleteRound);if(!confirm("¿Eliminar la ronda "+(i+1)+"?"))return;t.rounds.splice(i,1);t.updatedAt=new Date().toISOString();save();rerender()});
    if(!state.tournamentRoundDraft)return;
    document.querySelectorAll("[data-tourney-round-kind]").forEach(b=>b.onclick=()=>selectRoundKind(b.dataset.tourneyRoundKind));
    document.querySelectorAll("#tourneyCancelRound").forEach(b=>b.onclick=()=>{state.tournamentRoundDraft=null;rerender()});
    on("#tourneySaveRound","click",saveRound);
    document.querySelectorAll("[data-tourney-toggle]").forEach(b=>b.onclick=()=>{captureRound();state.tournamentRoundDraft[b.dataset.tourneyToggle]=b.dataset.value;rerender()});
    on("#tourneyOpponentSearch","input",e=>{
      state.tournamentRoundDraft.search=e.target.value;
      const grid=document.querySelector("#tourneyOpponentGrid");if(grid){grid.innerHTML=leadersHtml(e.target.value,"",true,state.tournamentRoundDraft.opponentId,true);bindLeaderChoices(grid,state.tournamentRoundDraft,true)}
    });
    bindLeaderChoices(document.querySelector("#tourneyOpponentGrid"),state.tournamentRoundDraft,true);
  }
  function bindLeaderChoices(grid,form,opponent){
    grid?.querySelectorAll("[data-tourney-leader]").forEach(b=>b.onclick=()=>{
      if(opponent)captureRound();else captureForm();
      form[opponent?"opponentId":"leaderId"]=opponent?(cheapestLeader(b.dataset.tourneyLeader)?.id||b.dataset.tourneyLeader):b.dataset.tourneyLeader;
      rerender();
    });
  }
  // Personal tournament backups are local to the signed-in account and browser.
  // Export/restore/remove are available exclusively in Cuenta → Datos y copias de seguridad.
  function exportAllTournaments(){
    if(!ownerKey()){notify("Inicia sesión para exportar torneos.");return}
    const data={format:"mialbumonepiece-tournaments-v1",tournaments:state.tournaments||[]};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    downloadBlob(blob,"mis-torneos-"+new Date().toISOString().slice(0,10)+".json");
    notify("Copia JSON de torneos preparada");
  }
  async function importAllTournaments(file){
    const key=ownerKey();
    if(!key||!file){notify("Inicia sesión para importar torneos.");return}
    if(file.size>5*1024*1024){alert("El archivo excede el tamaño máximo de 5 MB.");return}
    try{
      const document=JSON.parse(await file.text());
      if(ownerKey()!==key)return;
      if(document?.format!=="mialbumonepiece-tournaments-v1"||!Array.isArray(document.tournaments))
        throw Error("Formato JSON de torneos incorrecto");
      if(document.tournaments.length>2000)throw Error("El archivo contiene demasiados torneos");
      const names=new Set();
      for(const t of document.tournaments){
        if(!t||typeof t!=="object"||Array.isArray(t)||typeof t.id!=="string"||!t.id.trim()||t.id.length>160||
           typeof t.title!=="string"||!t.title.trim()||t.title.length>500||!Array.isArray(t.rounds)||
           t.rounds.length>200||names.has(t.id))throw Error("El archivo contiene torneos no válidos o identificadores repetidos");
        names.add(t.id);
      }
      const current=Array.isArray(state.tournaments)?state.tournaments:[];
      const existing=new Set(current.map(t=>t.id));
      const fresh=document.tournaments.filter(t=>!existing.has(t.id));
      if(!fresh.length){notify("No hay torneos nuevos que importar.");return}
      if(current.length+fresh.length>2000)throw Error("Supera el límite de 2.000 torneos");
      if(!confirm("¿Importar "+fresh.length+" torneos nuevos? Se mantendrán los existentes sin modificarlos."))return;
      if(ownerKey()!==key)return;
      const combined=[...current,...fresh];
      // Persist first: storage quota failure must never overwrite in-memory data.
      state.tournaments=combined;
      save();
      notify("Importados "+fresh.length+" torneos; ninguno de los anteriores se ha sobrescrito.");
    }catch(error){
      console.warn("Error importando torneos",error);
      alert("No se pudo importar la copia: "+(error.message||error));
    }
  }
  function deleteAllTournaments(){
    const key=ownerKey();if(!key)return notify("Inicia sesión para borrar tus torneos.");
    const n=state.tournaments?.length||0;
    if(!n)return notify("No hay torneos que borrar.");
    if(!confirm("¿Eliminar DEFINITIVAMENTE los "+n+" torneos de tu cuenta y todas sus rondas? Exporta antes un JSON si quieres conservarlos."))return;
    if(prompt("Para confirmar el borrado de TODOS tus torneos escribe BORRAR:")!=="BORRAR")return notify("Borrado cancelado");
    if(ownerKey()!==key)return;
    const ids=state.tournaments.map(t=>t.id);
    try{
      state.tournaments=[];state.tournamentId=null;state.tournamentDraft=null;
      state.tournamentRoundDraft=null;state.tournamentFinishDraft=null;state.tournamentStats=null;
      save(ids);notify("Eliminación solicitada para todos los torneos.");
    }catch(error){console.warn("No se pudieron borrar los torneos",error);notify("No se pudo completar el borrado.");}
  }
  window.exportAllTournaments=exportAllTournaments;
  window.importAllTournaments=importAllTournaments;
  window.deleteAllTournaments=deleteAllTournaments;
  const deckCss=document.createElement("style");
  deckCss.textContent=".tourney-leader-link{padding:0;border:0;background:transparent;cursor:pointer;flex:none}.tourney-deck-list{display:grid;gap:6px}.tourney-deck-card{display:flex;align-items:center;gap:12px;padding:7px;border-radius:9px;background:var(--panel2)}.tourney-deck-card img{width:46px;aspect-ratio:.716;object-fit:cover;border-radius:5px}.tourney-deck-card div{flex:1;min-width:0}.tourney-deck-card strong{white-space:nowrap}";
  document.head.appendChild(deckCss);
  window.tournamentsView=view;
  window.tournamentsBind=bind;
  window.tournamentsLoadForAccount=load;
  window.tournamentsSyncForAccount=id=>id===state.user?.id?syncTournaments():Promise.resolve(false);
})();
