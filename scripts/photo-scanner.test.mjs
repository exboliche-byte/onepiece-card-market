import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const photo=readFileSync(new URL("../photo-scanner.js",import.meta.url),"utf8");
const scanner=readFileSync(new URL("../scanner.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const build=readFileSync(new URL("./vercel-build.sh",import.meta.url),"utf8");
const a=photo.indexOf("function median(a){"),b=photo.indexOf("function makeCrop(",a);
assert.ok(a>=0&&b>a,"Detector pure module exists");
const detect=runInNewContext(photo.slice(a,b)+"\ndetectCardRegions",{
 MAX_CARDS:40,Math,Uint8Array,Int32Array,Array,Number,Infinity
});
function image(rectangles,w=900,h=630){
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  pixels[i]=237;pixels[i+1]=237;pixels[i+2]=232;pixels[i+3]=255;
  if(rectangles.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)){
   pixels[i]=42;pixels[i+1]=110+(x%50);pixels[i+2]=85+(y%50);
  }
 }
 return pixels;
}
test("single photo detects all six separated front-facing cards",()=>{
 const rects=[{x:70,y:40,w:150,h:210},{x:310,y:50,w:150,h:210},{x:550,y:60,w:150,h:210},
              {x:70,y:350,w:150,h:210},{x:310,y:360,w:150,h:210},{x:550,y:340,w:150,h:210}];
 const result=detect(image(rects),900,630);
 assert.equal(result.length,6);
 assert.ok(result.every(r=>r.w>140&&r.h>200&&r.w/r.h>.55&&r.w/r.h<.85));
});
test("different physically present cards produce separate crops, even when art is identical",()=>{
 const rects=[{x:90,y:40,w:155,h:215},{x:340,y:40,w:155,h:215}];
 const result=detect(image(rects),900,630);
 assert.equal(result.length,2);
 assert.ok(result[0].cx!==result[1].cx);
});
test("tiny colored dust on an empty table is not treated as a card",()=>{
 assert.equal(detect(image([{x:90,y:90,w:12,h:10}]),900,630).length,0);
});
test("photo mode supports camera, gallery, manual additions and explicit save only",()=>{
 assert.match(photo,/id="photoUpload"/);
 assert.match(photo,/id="photoCapture"/);
 assert.match(photo,/capture="environment"/);
 assert.match(photo,/void recognizeAdded\(reg\)/);
 assert.match(photo,/async function saveCards\(/);
 assert.match(photo,/rows\.filter\(r=>!r\.omitted\)/);
 assert.match(photo,/byPrint\.set\(r\.printId/);
 assert.match(photo,/setQty\(id,before\+count\)/);
 assert.match(scanner,/id="scanPhoto"/);
 assert.match(html,/<script src="\/photo-scanner\.js"><\/script>/);
 assert.match(build,/scanner\.js photo-scanner\.js scanner-ocr\.js/);
 assert.doesNotMatch(photo,/FileReader|fetch\([^)]*photo|\/api\/upload/);
});
