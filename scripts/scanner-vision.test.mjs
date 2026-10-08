import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInContext,createContext} from "node:vm";
const vm=createContext({Uint8ClampedArray,Uint32Array,Float32Array,Math,Set,Array,Object,Number,parseInt,String});
runInContext(readFileSync(new URL("../scanner-vision.js",import.meta.url),"utf8"),vm);
const {decode,dhash,distance,match,setRefs}=vm.__visionTest;
test("256-bit visual hashes have correct Hamming distance",()=>{
 const a=decode("af".repeat(32)),b=decode("af".repeat(32));
 assert.equal(distance(a,b),0);
 assert.equal(distance(decode("00".repeat(32)),decode("ff".repeat(32))),256);
});
test("Visual matcher ranks the exact printing for a stable synthetic frame",()=>{
 const pixels=new Uint8ClampedArray(160*224*4);
 for(let y=0;y<224;y++)for(let x=0;x<160;x++){
  const p=(y*160+x)*4;
  pixels[p]=(x*x*7+y*11)%256;pixels[p+1]=(x*13+y*y*3)%256;
  pixels[p+2]=(x*y*3+18)%256;pixels[p+3]=255;
 }
 const hash=a=>Array.from(a).map(n=>n.toString(16).padStart(8,"0")).join("");
 const art=dhash(pixels,160,224,[.05,.1,.95,.72]);
 const full=dhash(pixels,160,224,[.06,.06,.94,.94]);
 const wrong=decode("ff".repeat(32));
 setRefs([{id:"OP01-001_p1",art,full},{id:"OP01-002",art:wrong,full:wrong}]);
 const result=match(pixels,160,224);
 assert.equal(result[0].id,"OP01-001_p1");
 assert.equal(result[0].score,0);
});
