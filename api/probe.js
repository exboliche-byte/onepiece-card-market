export default {
  async fetch() {
    const urls=["https://onepieceprices.io/colours/green","https://onepieceprices.io/set/op02","https://onepieceprices.io/card/op02-036-p1-nami"];
    const out=[];
    for(const url of urls){
      try{
        const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0","accept":"text/html,application/xhtml+xml"}});
        const body=await r.text();
        const hits=[];
        for(const needle of ["Cardmarket","OP02-036_p1","Nami","market price","trend"]) {
          let pos=0,count=0;
          while(count<5){const i=body.indexOf(needle,pos);if(i<0)break;hits.push({needle,pos:i,snip:body.slice(Math.max(0,i-500),i+1800)});pos=i+needle.length;count++;}
        }
        out.push({url,status:r.status,len:body.length,hits});
      }catch(e){out.push({url,error:String(e)})}
    }
    return Response.json(out);
  }
};