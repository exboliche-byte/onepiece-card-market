import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const scanner=readFileSync(new URL("../scanner.js",import.meta.url),"utf8");
const begin=scanner.indexOf("function scannerVisualSuggestion(");
const end=scanner.indexOf("// Fallback presentation only:",begin);
assert.ok(begin>0&&end>begin);
const {scannerVisualSuggestion}=runInNewContext(scanner.slice(begin,end)+"\n({scannerVisualSuggestion})",{
 idBase:id=>String(id).replace(/_[prc]\\d+$/i,"")
});
test("Confident visual difference recommends exact parallel, not base",()=>{
 const ranked=[{id:"OP01-001_p1",score:30,art:35},{id:"OP01-001",score:61,art:65}];
 assert.equal(scannerVisualSuggestion(ranked,"OP01-001"),"OP01-001_p1");
});
test("Ambiguous or solitary match cannot silently select a printing",()=>{
 assert.equal(scannerVisualSuggestion([{id:"OP01-001_p1",score:51,art:50},{id:"OP01-001",score:57,art:60}],"OP01-001"),"");
 assert.equal(scannerVisualSuggestion([{id:"OP01-001_p1",score:20,art:20}],"OP01-001"),"");
 assert.equal(scannerVisualSuggestion([{id:"OP01-001",score:81,art:40},{id:"OP01-001_p1",score:99,art:45}],"OP01-001"),"");
});
test("Saving preserves only selected exact printing and requires confirmation",()=>{
 assert.match(scanner,/selectedId:chosen\.id,source:"Elegida de los resultados visuales"/);
 assert.match(scanner,/selectedId:scannerVisualSuggestion\(visualResults,id\)/);
 assert.match(scanner,/if\(!card\)\{status\("Elige la impresión exacta antes de añadir\."/);
 assert.match(scanner,/await setQty\(card\.id,after\)/);
 assert.match(scanner,/printId:cardByCode\(code\)\.length===1\?base\.id:""/);
 assert.match(scanner,/Confirma la impresión…/);
});
