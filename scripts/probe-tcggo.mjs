for (const path of [
  "/v1/cards/30857?source=cardmarket&region=EU",
  "/v1/prices/30857?source=cardmarket&region=EU",
  "/v1/cards/30857",
  "/v1/prices/30857"
]) {
  const url="https://tcggraph.com"+path;
  try {
    const r=await fetch(url,{headers:{"accept":"application/json","user-agent":"MiAlbumOnePiece/1.0"}});
    const t=await r.text();
    console.log("URL",url,"STATUS",r.status,"LEN",t.length);
    console.log(t.slice(0,8000));
  } catch(e) { console.log("ERR",url,String(e)); }
}
