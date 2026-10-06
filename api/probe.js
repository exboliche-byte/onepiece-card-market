export default {
  async fetch() {
    const urls=[
      "https://onepieceprices.io/colours/green",
      "https://onepieceprices.io/sets/op02",
      "https://onepieceprices.io"
    ];
    const out=[];
    for(const url of urls){
      try{
        const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0","accept":"text/html,application/xhtml+xml"}});
        const body=await r.text();
        out.push({url,status:r.status,contentType:r.headers.get("content-type"),len:body.length,sample:body.slice(0,16000)});
      }catch(e){out.push({url,error:String(e)})}
    }
    return Response.json(out);
  }
};