import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const script=fs.readFileSync(path.join(root,"tournament-prep.js"),"utf8");
const meta=fs.readFileSync(path.join(root,"api/meta.js"),"utf8");
function build(){
 const leaders=[{id:"OP01-003",name:"Sanji",card:{id:"OP01-003",name:"Sanji"}},
 {id:"OP02-001",name:"Zoro",card:{id:"OP02-001",name:"Zoro"}},
 {id:"OP03-001",name:"Luffy",card:{id:"OP03-001",name:"Luffy"}}];
 const state={tab:"tournaments",decks:[],tournaments:[],sb:{rpc:async()=>({data:{leaders:[],matchups:[],recordedGames:0,eligibleTournaments:0,contributingUsers:0},error:null})}};
 const context={window:{},state,document:{createElement:()=>({textContent:""}),head:{appendChild:()=>{}},querySelector:()=>null,querySelectorAll:()=>[]},
  URLSearchParams,deckPrintedCode:x=>String(x||"").split("_")[0],esc:x=>String(x),
  resolveDeckImportCard:x=>leaders.find(v=>v.id===x)?.card,cardImg:(c,cls)=>'<img class="'+cls+'" src="'+c.id+'">',
  competitiveLeaderOptions:()=>leaders,renderShell:()=>{},fetch:async()=>({ok:true,status:200,text:async()=>JSON.stringify({leaders:[],matchups:[],games:0})})};
 vm.runInNewContext(script,context,{timeout:3000});
 return {module:context.window.TournamentPrep,state};
}
test("Tournament preparation is integrated and its browser JavaScript parses",()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 const tournament=fs.readFileSync(path.join(root,"tournaments.js"),"utf8");
 assert.match(tournament,/TournamentPrep\?\.view/);
 assert.match(tournament,/TournamentPrep\?\.bind/);
 const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
 assert.match(html,/src="\/tournament-prep\.js"/);
});
test("Private totals include every recorded round but exclude BYEs, no-shows, old tournaments and other leaders",()=>{
 const {module}=build(),sample=[{date:"2026-10-09",title:"Store",leaderId:"OP01-003",rounds:[
  {kind:"swiss",result:"W",opponentId:"OP02-001",dice:"W",start:"1"},
  {kind:"swiss",result:"L",opponentId:"OP02-001",dice:"L",start:"2",note:"Mulligan"},
  {kind:"bye",result:"W",opponentId:"OP03-001"},
  {kind:"noshow",result:"W",opponentId:"OP03-001"},
  {kind:"swiss",result:"W",opponentId:"OP03-001"}
 ]},{date:"2024-01-01",leaderId:"OP01-003",rounds:[{kind:"swiss",result:"L",opponentId:"OP02-001"}]},
 {date:"2026-10-09",leaderId:"OP03-001",rounds:[{kind:"swiss",result:"L",opponentId:"OP02-001"}]}];
 const result=module.summarizePersonal("OP01-003",90,sample,[],Date.parse("2026-10-09T22:00:00"));
 assert.equal(result.events,1);assert.equal(result.total.wins,2);assert.equal(result.total.losses,1);
 assert.equal(result.total.first.wins,1);assert.equal(result.total.second.losses,1);
 assert.equal(result.total.diceW.wins,1);assert.equal(result.total.diceL.losses,1);
 assert.equal(result.pairs.get("OP02-001").wins,1);assert.equal(result.pairs.get("OP02-001").losses,1);
 assert.equal(result.recent.length,3);
});
test("View includes source separation, personalized dice and turn-order analysis",()=>{
 const {module,state}=build();
 state.tournaments=[{date:"2026-10-09",leaderId:"OP01-003",rounds:[{kind:"swiss",result:"W",opponentId:"OP02-001",start:"1"}]}];
 const page=module.view();
 for(const phrase of ["Todos los enfrentamientos disponibles","Mis estadísticas con este líder","Dado ganado",
  "Dado perdido","Meta combinado","Comunidad","Todas las rondas","Mis últimas partidas","Mínimo 20 partidas"])
  assert.ok(page.includes(phrase),phrase);
});
test("Expanded public coverage pages through tournaments, tracks limits and preserves standard meta",()=>{
 assert.match(script,/api\/meta-unified/);
 assert.match(meta,/game=OP&limit=500&page=/);
 assert.match(meta,/expanded\?140:100/);
 assert.match(meta,/eligibleEvents:eligible\.length/);
 assert.match(meta,/truncated:eligible\.length>selected\.length/);
 assert.match(meta,/rateLimited/);
 assert.match(script,/OPlay · 1\.º/);
});
test("Production build copies the preparation module and runs its tests",()=>{
 const build=fs.readFileSync(path.join(root,"scripts/vercel-build.sh"),"utf8");
 assert.match(build,/scripts\/tournament-prep\.test\.mjs/);
 assert.match(build,/tournament-prep\.js wants\.js collection-boxes\.js public\//);
});
