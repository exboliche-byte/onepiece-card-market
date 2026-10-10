/* Public historical deck-list cache. No account or collection data is stored here. */
(function(root,factory){
"use strict";
const api=factory(root);
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(root)root.WantsArchiveCache=api;
})(typeof window!=="undefined"?window:undefined,function(root){
"use strict";
const NAME="mialbum-legal-decks-v1",STORE="publicArchives",KEY="standard-europe";
function compact(deck){
 if(!deck||typeof deck!=="object"||!deck.leaderId||!deck.cards||typeof deck.cards!=="object")return null;
 const cards={};
 for(const [id,n] of Object.entries(deck.cards)){
  const q=Number(n);
  if(typeof id==="string"&&id.length<36&&Number.isInteger(q)&&q>0&&q<=4)cards[id]=q;
 }
 if(!Object.keys(cards).length)return null;
 return {id:String(deck.id||"").slice(0,300),source:String(deck.source||"").slice(0,90),
  sourceUrl:String(deck.sourceUrl||"").slice(0,700),tournament:String(deck.tournament||"").slice(0,250),
  date:deck.date||null,players:Number(deck.players)||0,placing:Number(deck.placing)||0,
  quality:String(deck.quality||"").slice(0,100),leaderId:String(deck.leaderId),leaderName:String(deck.leaderName||"").slice(0,150),cards};
}
function valid(data){
 return !!data&&data.schema===1&&Number.isFinite(data.savedAt)&&data.savedAt>0&&
  Array.isArray(data.decks)&&Array.isArray(data.notes)&&data.decks.every(d=>d&&typeof d.leaderId==="string"&&d.cards&&typeof d.cards==="object");
}
function open(){
 return new Promise(resolve=>{
  if(!root?.indexedDB)return resolve(null);
  try{
   const request=root.indexedDB.open(NAME,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>resolve(null);
   request.onblocked=()=>resolve(null);
  }catch{return resolve(null)}
 });
}
async function load(){
 const db=await open();
 if(db){
  const value=await new Promise(resolve=>{
   try{
    const tx=db.transaction(STORE,"readonly"),request=tx.objectStore(STORE).get(KEY);
    request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);
    tx.onabort=()=>resolve(null);
   }catch{return resolve(null)}
  });
  db.close();
  if(valid(value))return value;
 }
 try{
  const value=JSON.parse(root?.localStorage?.getItem(NAME)||"null");
  return valid(value)?value:null;
 }catch{return null}
}
async function save(input){
 const data={schema:1,savedAt:Date.now(),
  progress:input?.progress&&typeof input.progress==="object"?input.progress:{},
  complete:input?.complete===true,
  notes:Array.isArray(input?.notes)?input.notes.map(String).slice(0,12):[],
  decks:(Array.isArray(input?.decks)?input.decks:[]).map(compact).filter(Boolean)};
 if(!data.decks.length)return null;
 const db=await open();
 if(db){
  const success=await new Promise(resolve=>{
   try{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(data,KEY);
    tx.oncomplete=()=>resolve(true);tx.onabort=()=>resolve(false);tx.onerror=()=>resolve(false);
   }catch{return resolve(false)}
  });
  db.close();
  if(success)return data;
 }
 try{
  const serialized=JSON.stringify(data);
  if(serialized.length<2_500_000){root?.localStorage?.setItem(NAME,serialized);return data}
 }catch{/* Private browsing may disable storage. */}
 return null;
}
return {load,save};
});
