import {chromium} from "playwright";
const target=process.env.BASE_URL||"https://onepiece-card-market.vercel.app";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const results=[],errors=[];
async function step(name,fn){
 const started=Date.now();
 try{const detail=await fn();results.push({name,ok:true,elapsed:Date.now()-started,detail:detail||""});console.log("BROWSER_PASS",name,JSON.stringify(detail||{}))}
 catch(e){results.push({name,ok:false,error:String(e.message||e).slice(0,280)});console.log("BROWSER_FAIL",name,String(e.stack||e).slice(0,900))}
}
const context=await browser.newContext({viewport:{width:1370,height:820},locale:"es-ES",permissions:[]});
const page=await context.newPage();
page.on("pageerror",e=>errors.push({page:page.url(),error:String(e.message||e)}));
await step("Homepage and real catalog rendered",async()=>{
 const response=await page.goto(target,{waitUntil:"domcontentloaded",timeout:45000});
 if(!response||response.status()>=400)throw Error("HTTP "+response?.status());
 await page.locator("#catalogResults article.card").first().waitFor({timeout:65000});
 const count=await page.locator("#catalogResults article.card").count();
 if(count<10)throw Error("Too few catalog cards: "+count);
 return {status:response.status(),cardsOnPage:count,title:await page.title()}
});
await step("Search by exact card ID and render price",async()=>{
 await page.locator("#catalogSearch").fill("OP13-043");
 await page.waitForTimeout(900);
 const tiles=page.locator("#catalogResults article.card");
 await tiles.first().waitFor({timeout:15000});
 const body=await tiles.first().innerText();
 if(!/OP13-043|Otama/i.test(body))throw Error("Wrong first card after search: "+body.slice(0,100));
 return {matches:await tiles.count(),sample:body.slice(0,120)}
});
await step("Sort catalogue by price",async()=>{
 await page.locator("#catalogSearch").fill("");
 await page.locator("#catSort").selectOption("price");
 await page.locator("#catalogResults article.card").first().waitFor({timeout:30000});
 return {tiles:await page.locator("#catalogResults article.card").count()}
});
await step("Open a card detail with versions",async()=>{
 await page.locator("#catalogSearch").fill("OP13-043");
 await page.waitForTimeout(700);
 await page.locator("#catalogResults [data-detail]").first().click({timeout:15000});
 await page.waitForTimeout(800);
 const body=await page.locator("body").innerText();
 if(!/Otama|OP13-043/.test(body))throw Error("Detail did not render");
 await page.locator(".modalback [data-close]").first().click({timeout:10000});
 await page.waitForTimeout(250);
 return {hasCardCode:true,detailClosed:true}
});
await step("Expansions listing renders",async()=>{
 await page.locator('.desktop-side [data-tab="album"]').first().click();
 await page.waitForTimeout(600);
 const sets=await page.locator("[data-open-set]").count();
 if(sets<20)throw Error("Missing expansion tiles: "+sets);
 return {sets}
});
await step("Community meta page loads without JSON parser crash",async()=>{
 await page.locator('.desktop-side [data-tab="meta"]').first().click();
 await page.waitForTimeout(1000);
 const title=await page.locator("h1").first().innerText();
 if(!title.includes("Meta"))throw Error("Meta view unavailable");
 await page.locator('[data-meta-scope="community"]').first().click();
 await page.waitForTimeout(1000);
 const body=await page.locator("body").innerText();
 if(/Unexpected token/i.test(body))throw Error("Meta invalid JSON");
 return {title}
});
await step("Tournaments and login state do not crash",async()=>{
 await page.locator('.desktop-side [data-tab="tournaments"]').first().click();
 await page.waitForTimeout(300);
 const text=await page.locator("body").innerText();
 if(!/Torneos|Inicia sesión/i.test(text))throw Error("Missing tournament view");
 return {visible:true}
});
await step("Account view is available",async()=>{
 await page.locator('.desktop-side [data-tab="account"]').first().click();
 await page.waitForTimeout(350);
 const txt=await page.locator("body").innerText();
 if(!/Cuenta|Iniciar sesión/i.test(txt))throw Error("No account content");
 return {visible:true}
});
await step("Mobile navigation exposes Tournaments, scanner and More expansions",async()=>{
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(450);
 const mobile=page.locator(".mobile-nav");
 if(!await mobile.isVisible())throw Error("Mobile navigation invisible");
 const tourn=mobile.locator('button[data-tab="tournaments"]');
 if(!await tourn.isVisible())throw Error("Tournaments missing from bottom bar");
 const scan=mobile.locator('button[data-scan-open]');
 if(!await scan.isVisible())throw Error("Scanner missing from bottom bar");
 await mobile.locator("#mobileMoreToggle").click();
 const sets=mobile.locator('#mobileMorePanel button[data-tab="album"]');
 if(!await sets.isVisible())throw Error("Expansions missing under More");
 return {ok:true}
});
await browser.close();
const fatal=errors.filter(e=>!/ResizeObserver loop|Loading chunk/.test(e.error));
console.log("BROWSER_AUDIT_SUMMARY "+JSON.stringify({results,uncaughtErrors:fatal.slice(0,25)}));
if(results.some(x=>!x.ok)||fatal.length)process.exitCode=1;
