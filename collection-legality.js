/* Standard legality (EU). This module never edits persisted collection quantities. */
(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.OnePieceLegality=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const banned=new Set(["OP06-047","OP03-040","OP06-086","ST10-001","OP06-116"]);
  const mihawkBanFrom=Date.parse("2026-10-12T00:00:00+02:00");
  // Manga block-X exceptions and confirmed updated block-4 reprints.
  // Once a logical card has an eligible reprint, all artworks are legal.
  // Bandai reference: https://www.onepiece-cardgame.com/news/blockicon-card.html (2026-07-03)
  const updatedOldCards=new Set([
    "OP01-016","OP01-120","OP02-013","OP03-122","OP04-083",
    "OP01-039","OP01-055","OP02-005","OP02-068",
    "OP03-008","OP03-044","OP03-048","OP03-072","OP03-097",
    "OP04-016","OP04-077","OP04-096",
    "ST01-011","ST02-007","ST06-008"
  ]);
  function baseId(id){
    return String(id||"").toUpperCase()
      .replace(/__CSV_[A-Z0-9]+(?:_[A-Z]+)?$/,"")
      .replace(/_(?:P\d+|R\d+|C\d+|JP\d+)$/,"");
  }
  function block(c){
    const b=String(c?.block??"").trim().toUpperCase();
    return b==="X"?Infinity:/^[1-9]\d*$/.test(b)?Number(b):null;
  }
  function buildPlayableIndex(cards){
    const legal=new Set(updatedOldCards);
    for(const c of cards||[]){
      const b=block(c);
      if(b!==null&&b>=2)legal.add(baseId(c.id));
    }
    return legal;
  }
  function status(card,playable,now=Date.now()){
    const id=baseId(card?.id);
    if(banned.has(id)||(id==="OP14-020"&&now>=mihawkBanFrom))return "banned";
    if(playable?.has(id))return null;
    const b=block(card);
    if(b===1)return "rotated";
    // Missing block metadata: infer only the originally retired set numbers.
    if(b===null&&(/^(?:OP0[1-4])-\d{3}$/.test(id)||/^ST0[1-9]-\d{3}$/.test(id)))return "rotated";
    return null;
  }
  return {baseId,buildPlayableIndex,status};
});
