import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const photo=readFileSync(new URL("../photo-scanner.js",import.meta.url),"utf8");
const detector=readFileSync(new URL("../photo-detector.js",import.meta.url),"utf8");
const scanner=readFileSync(new URL("../scanner.js",import.meta.url),"utf8");
const vision=readFileSync(new URL("../scanner-vision.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const build=readFileSync(new URL("./vercel-build.sh",import.meta.url),"utf8");
const context={Math,Uint8Array,Uint8ClampedArray,Int32Array,Array,Number};
runInNewContext(detector,context);
const {detectCardRegions}=context.__photoDetectorTest;
function image(rectangles,w=900,h=630,pattern=false){
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  const inside=rectangles.some(r=>{
   const a=r.angle||0,cos=Math.cos(a),sin=Math.sin(a),dx=x-(r.cx??(r.x+r.w/2)),dy=y-(r.cy??(r.y+r.h/2));
   const xx=dx*cos+dy*sin,yy=-dx*sin+dy*cos;
   return Math.abs(xx)<r.w/2&&Math.abs(yy)<r.h/2;
  });
  const shade=pattern?(x*11+y*17)%11:0;
  pixels[i]=inside?42:230+shade;pixels[i+1]=inside?110+x%50:230+shade;
  pixels[i+2]=inside?85+y%50:228+shade;pixels[i+3]=255;
 }
 return pixels;
}
test("six separate cards return six regions, including duplicate artwork",()=>{
 const rows=[40,350],cols=[70,310,550],cards=[];
 for(const y of rows)for(const x of cols)cards.push({x,y,w:150,h:210});
 const result=detectCardRegions(image(cards),900,630);
 assert.equal(result.length,6);
 assert.ok(result.every(r=>r.w>=145&&r.h>=205&&r.w/r.h>.55&&r.w/r.h<.85));
});
test("angled cards are detected with correct orientation",()=>{
 const cards=[{cx:220,cy:330,w:155,h:226,angle:.21},{cx:550,cy:310,w:160,h:227,angle:-.26}];
 const result=detectCardRegions(image(cards,850,690,true),850,690);
 assert.equal(result.length,2);
 for(const card of cards){
  const nearest=result.reduce((a,b)=>Math.hypot(b.cx-card.cx,b.cy-card.cy)<Math.hypot(a.cx-card.cx,a.cy-card.cy)?b:a);
  assert.ok(Math.abs(nearest.angle-card.angle)<.15,"Angle mismatch: "+nearest.angle+" vs "+card.angle);
 }
 assert.match(photo,/c\.rotate\(-\(region\.angle\|\|0\)\)/);
 assert.match(photo,/ctx\.rotate\(r\.angle\|\|0\)/);
});
test("tiny colored specks do not count as cards",()=>{
 assert.equal(detectCardRegions(image([{x:90,y:90,w:12,h:10}]),900,630).length,0);
});
test("photo scanner detects in background worker and supports manual correction",()=>{
 assert.match(photo,/new Worker\("\/photo-detector\.js/);
 assert.match(photo,/await detectionRegions\(canvas\)/);
 assert.match(photo,/stopDetection\(\)/);
 assert.match(photo,/void recognizeAdded\(reg\)/);
 assert.match(build,/photo-scanner\.js/);
 assert.match(build,/photo-detector\.js/);
});
test("photo scanner recognizes upside-down cards, optional OCR and exact print selection",()=>{
 assert.match(photo,/recognizeFrame\(region,Math\.PI\)/);
 assert.match(photo,/data-photo-ocr/);
 assert.match(photo,/scanner-ocr\.js/);
 assert.match(photo,/data-photo-print/);
 assert.match(photo,/byPrint\.set\(r\.printId/);
 assert.match(photo,/setQty\(id,before\+count\)/);
 assert.match(vision,/data\.limit\|\|8/);
 assert.match(html,/<script src="\/photo-scanner\.js"><\/script>/);
});
test("photo closes immediately and Back retains parent scanner",()=>{
 assert.match(photo,/const navigateBack=!fromHistory&&historyActive/);
 assert.match(photo,/stopDetection\(\);workerStop\(\)/);
 assert.match(photo,/photoBackPending=true;\s*history\.back\(\)/);
 assert.match(photo,/function consumePhotoBack\(\)/);
 assert.match(scanner,/OnePiecePhotoScanner\?\.consumePhotoBack\?\.\(\)/);
 assert.match(scanner,/OnePiecePhotoScanner\?\.close\(\{fromHistory:true\}\)/);
});
