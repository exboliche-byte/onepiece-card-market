import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../scanner-ocr.js",import.meta.url),"utf8");
const mod=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
test("Parses real One Piece identifiers despite OCR spacing and punctuation",()=>{
 const samples=[
  ["OP06-043","OP06-043"],["OP 06 043","OP06-043"],
  ["OP13.043","OP13-043"],["ST10 005","ST10-005"],
  ["P - 083","P-083"],["EB 02 013","EB02-013"],
  ["PRB02 001","PRB02-001"],["OPI3-043","OP13-043"],
  ["OPO6-O43","OP06-043"]
 ];
 for(const [value,expected] of samples){
   assert.ok(mod.codesFromText(value).includes(expected),"Could not parse "+value);
 }
});
test("Rejects random words and incomplete codes",()=>{
 for(const x of ["ONE PIECE","MONKEY D LUFFY","OP06","P-83","000-000","03-043"]){
   assert.deepEqual(mod.codesFromText(x),[],x)
 }
});
test("Worker OCR is reusable and exposes a teardown",()=>{
 assert.equal(typeof mod.createEngine,"function");
 const instance=mod.createEngine(()=>{});
 assert.equal(typeof instance.init,"function");
 assert.equal(typeof instance.recognize,"function");
 assert.equal(typeof instance.destroy,"function");
});
