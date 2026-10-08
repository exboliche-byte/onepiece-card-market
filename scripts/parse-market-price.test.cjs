"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {parseLimitlessPrice:p}=require("./parse-market-price.cjs");
test("US separators preserve thousands and cents",()=>{
 assert.equal(p("3,054.77 €"),3054.77);
 assert.equal(p("1,237.72€"),1237.72);
 assert.equal(p("10,459.36"),10459.36);
 assert.equal(p("0.24"),.24);
});
test("Spanish separators preserve thousands and cents",()=>{
 assert.equal(p("3.054,77 €"),3054.77);
 assert.equal(p("1.237,72"),1237.72);
 assert.equal(p("0,24 €"),.24);
 assert.equal(p("0,02"),.02);
});
test("plain and thousands-only values remain valid",()=>{
 assert.equal(p("1450"),1450);
 assert.equal(p("1,234"),1234);
 assert.equal(p("1.234"),1234);
 assert.equal(p("€0.01"),.01);
});
test("reject missing or invalid values",()=>{
 assert.equal(p(""),null);
 assert.equal(p("—"),null);
 assert.equal(p("€0"),null);
});
