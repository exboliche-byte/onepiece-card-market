for (const url of [
  "https://tcggraph.com/v1/cards/OP02-036?source=cardmarket&region=EU",
  "https://tcggraph.com/v1/cards/OP02-036_p1?source=cardmarket&region=EU",
  "https://tcggraph.com/v1/prices/OP02-036?source=cardmarket&region=EU"
]) {
  try {
    const r = await fetch(url,{headers:{"accept":"application/json","user-agent":"MiAlbumOnePiece/1.0"}});
    const t = await r.text();
    console.log("URL",url,"STATUS",r.status,"LEN",t.length);
    console.log(t.slice(0,5000));
  } catch(e) { console.log("ERR",url,String(e)); }
}