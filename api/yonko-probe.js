const HOST="https://www.pankurecords.com";
export default {async fetch(req){
 const op=new URL(req.url).searchParams.get("which")||"event";
 const path=op==="robots"?"/robots.txt":op==="set"?"/yonko/sets/op17":"/yonko/events/op17-aea8337569f6";
 try{
  const controller=new AbortController(),id=setTimeout(()=>controller.abort(),9000);
  const r=await fetch(HOST+path,{headers:{"accept":"text/html","user-agent":"MiAlbumOnePiece/1.0 (+https://onepiece-card-market.vercel.app)"},signal:controller.signal});
  const body=await r.text();clearTimeout(id);
  const marks=["__NEXT_DATA__","self.__next_f.push","1xOP17-079","4xOP17-086","Full list","OP17-079","/yonko/decks/","robots","/yonko/events/"];
  const windows=marks.map(k=>{let n=body.indexOf(k);return {match:k,index:n,sample:n>=0?body.slice(Math.max(0,n-260),Math.min(body.length,n+600)):null}});
  const detailPos=body.indexOf('<details open'),feedPos=body.indexOf('data-yonko-kind='),summaryPos=body.indexOf('<summary'),ogPos=body.indexOf('property="og:description"');
  const extra={details:detailPos>=0?body.slice(detailPos,detailPos+3000):null,feed:feedPos>=0?body.slice(Math.max(0,feedPos-100),feedPos+2000):null,summary:summaryPos>=0?body.slice(summaryPos,summaryPos+800):null,og:ogPos>=0?body.slice(ogPos,ogPos+400):null};
  const hrefs=[...body.matchAll(/href=["']([^"']*yonko[^"']*)["']/g)].slice(0,12).map(m=>m[1]);
  return Response.json({status:r.status,url:r.url,contentType:r.headers.get("content-type"),length:body.length,first:body.slice(0,800),windows,hrefs,extra});
 }catch(e){return Response.json({error:String(e.message)},{status:502})}
}};