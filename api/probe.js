export default {
  async fetch() {
    const urls = [
      "https://www.tcggo.com/cards/30857",
      "https://www.tcggo.com/episodes/369/cards",
      "https://www.tcggo.com/api/cards/30857",
      "https://www.tcggo.com/api/episodes/369/cards"
    ];
    const out=[];
    for(const url of urls){
      try{
        const r=await fetch(url,{headers:{accept:"application/json,text/plain,*/*", "user-agent":"MiAlbumOnePiece/1.0"}});
        const body=await r.text();
        out.push({url,status:r.status,contentType:r.headers.get("content-type"),body:body.slice(0,12000)});
      }catch(e){out.push({url,error:String(e)})}
    }
    return Response.json(out);
  }
};