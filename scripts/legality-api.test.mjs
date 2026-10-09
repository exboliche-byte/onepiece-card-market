import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const module=fs.readFileSync(new URL("../collection-legality.js",import.meta.url),"utf8");
const api=fs.readFileSync(new URL("../api/legality.js",import.meta.url),"utf8");
test("latest rules are fetched via dynamic API, with a packaged fallback",()=>{
 assert.match(module,/for\(const path of \["\/api\/legality","\/data\/legality\.json"\]\)/);
 assert.match(module,/if\(!validate\(payload\)\)/);
 assert.match(api,/raw\.githubusercontent\.com\/exboliche-byte\/onepiece-card-market\/main\/data\/legality\.json/);
 assert.match(api,/s-maxage=1800/);
});
test("dynamic feed cannot edit collection data or expose secrets",()=>{
 assert.doesNotMatch(api,/SUPABASE|localStorage|collection_items|service_role/);
 assert.match(api,/request\.method!=="GET"/);
 assert.match(api,/rules\?\.schemaVersion!==1/);
});
