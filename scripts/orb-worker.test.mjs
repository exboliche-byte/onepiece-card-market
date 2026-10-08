// Validación rápida del arranque del Worker y de la transferencia de fotogramas.
// El mock de OpenCV simula su declaración global "var cv", que antes rompía el Worker.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInContext,createContext} from "node:vm";

test("ORB worker loads OpenCV global, indexes a reference and scans a frame",async()=>{
  const messages=[];
  const mockCV={Mat:function Mat(){},ORB:function ORB(){},
    BFMatcher:function BFMatcher(){},KeyPointVector:function KeyPointVector(){},
    DMatchVector:function DMatchVector(){}};
  class MockEngine {
    constructor(api){assert.equal(api,mockCV)}
    async prepareCache(){}
    async indexCard(){return true}
    scan(){return {best:{card:{id:"OP01-001"},good:47,cells:8},second:null,features:250}}
  }
  let context;
  const globals={
    mockCV,MockEngine,setTimeout,clearTimeout,
    OffscreenCanvas:class OffscreenCanvas{},
    createImageBitmap:async()=>({}),
    ImageData:class ImageData{
      constructor(data,width,height){this.data=data;this.width=width;this.height=height}
    },
    postMessage(message){messages.push(message)}
  };
  globals.self=globals;
  globals.importScripts=(url)=>{
    if(url.startsWith("/orb-engine.js")){
      runInContext("self.OptcgOrbEngine = MockEngine;",context);
    }else if(url.includes("/opencv.js")){
      // Emula cómo declara OpenCV su variable pública a nivel global.
      runInContext("var cv = self.mockCV;",context);
    }else throw Error("Import inesperado: "+url);
  };
  context=createContext(globals);
  const source=readFileSync(new URL("../orb-worker.js",import.meta.url),"utf8");
  runInContext(source,context,{filename:"orb-worker.js"});
  context.self.onmessage({data:{type:"start",cards:[{id:"OP01-001"}]}});
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.ok(messages.some(x=>x.type==="boot"),"No llegó el inicio del Worker");
  assert.ok(messages.some(x=>x.type==="vision-ready"),"OpenCV no terminó su inicialización");
  assert.ok(messages.some(x=>x.type==="ready"),"Motor ORB no arrancó");
  assert.ok(messages.some(x=>x.type==="progress"&&x.loaded===1),"No se indexó una referencia");
  assert.equal(messages.filter(x=>x.type==="error").length,0,"Worker falló al arrancar");
  const pixels=new Uint8ClampedArray(320*448*4);
  context.self.onmessage({data:{type:"frame",pixels:pixels.buffer}});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(messages.some(x=>x.type==="result"&&x.best?.id==="OP01-001"),
    "El Worker no procesó el fotograma");
});
