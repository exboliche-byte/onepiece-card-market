import fs from "node:fs/promises";

const ROOT = "https://onepieceprices.io";
const COLOURS = ["red","green","blue","purple","black","yellow"];
const CONCURRENCY = 6;
const REQUEST_TIMEOUT = 30000;

function localIdFromSlug(slug) {
  const parts = String(slug || "").toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return "";
  let id = "";
  if (/^(op|eb|st|prb)\d{2}$/.test(parts[0]) && parts[1]) {
    id = parts[0].toUpperCase() + "-" + parts[1].toUpperCase();
  } else if (/^(p|ex|don)$/.test(parts[0]) && parts[1]) {
    id = parts[0].toUpperCase() + "-" + parts[1].toUpperCase();
  } else return "";
  if (/^[prc]\d+$/i.test(parts[2] || "")) id += "_" + parts[2].toUpperCase();
  return id;
}
function versionFromId(id) {
  const m = String(id || "").match(/_(?:p|r|c)(\d+)$/i);
  return m ? Number(m[1]) + 1 : 1;
}
function parseEuroPrice(html) {
  for (const m of String(html ?? "").matchAll(/€\s*([0-9][0-9.,]*)/g)) {
    const n = Number(m[1].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}
async function fetchText(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {"user-agent":"MiAlbumOnePiece/1.0","accept":"text/html,application/xhtml+xml"}
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise(resolve => setTimeout(resolve, 700 * attempt));
    return fetchText(url, attempt + 1);
  } finally { clearTimeout(timer); }
}
function extractCardRows(html, colour) {
  const source = String(html);
  const rows = [];
  for (const m of source.matchAll(/<a[^>]+href=["']\/set\/([^"'/?#]+)\/card\/([^"'/?#]+)["'][^>]*>/gi)) {
    const start = m.index + m[0].length;
    const end = source.indexOf("</a>", start);
    const block = source.slice(start, end > start ? end : Math.min(source.length, start + 5000));
    const id = localIdFromSlug(m[2]);
    if (!id) continue;
    const eur = parseEuroPrice(block);
    if (eur === null) continue;
    rows.push({id, eur, colour});
  }
  return rows;
}
function cardmarketSearchUrl(id, name) {
  const version = versionFromId(id);
  const base = String(id).replace(/_(?:p|r|c)\d+$/i, "");
  return "https://www.cardmarket.com/es/OnePiece/Products/Singles?mode=list&searchString=" +
    encodeURIComponent([name, base, "(V."+version+")"].filter(Boolean).join(" "));
}
async function main() {
  const parsed = JSON.parse(await fs.readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
  const localCards = (Array.isArray(parsed) ? parsed : Object.entries(parsed || {}).map(([id,c]) => ({...(c||{}),id:c?.id||id})))
    .map(c => ({...c,id:String(c.id||"").trim()})).filter(c => c.id);
  const wanted = new Map(localCards.map(c => [c.id.toUpperCase(), c]));
  const discovered = new Map();

  let cursor = 0;
  await Promise.all(Array.from({length: COLOURS.length}, async () => {
    const i = cursor++;
    const colour = COLOURS[i];
    try {
      const html = await fetchText(ROOT + "/colours/" + colour);
      for (const row of extractCardRows(html, colour)) {
        const key = row.id.toUpperCase();
        if (!wanted.has(key) || discovered.has(key)) continue;
        discovered.set(key, {...row, name:String(wanted.get(key)?.name||"").trim()});
      }
      console.log("colour",colour,"cards",discovered.size);
    } catch (e) {
      console.warn("colour fetch failed",colour,String(e));
    }
  }));

  // Supplement cards that might not belong to a colour page.
  if (discovered.size < wanted.size * 0.7) {
    try {
      const browse = await fetchText(ROOT + "/browse");
      const setSlugs = [...new Set([...browse.matchAll(/href=["']\/set\/([^"'/?#]+)["']/gi)].map(m => m[1].toLowerCase()))];
      let setCursor = 0;
      await Promise.all(Array.from({length: Math.min(4,setSlugs.length)}, async () => {
        while (true) {
          const i = setCursor++;
          if (i >= setSlugs.length) return;
          try {
            const html = await fetchText(ROOT + "/set/" + setSlugs[i]);
            for (const row of extractCardRows(html, setSlugs[i])) {
              const key = row.id.toUpperCase();
              if (!wanted.has(key) || discovered.has(key)) continue;
              discovered.set(key,{...row,name:String(wanted.get(key)?.name||"").trim()});
            }
          } catch {}
        }
      }));
    } catch {}
  }

  const cards = {};
  for (const [key,row] of discovered.entries()) {
    const id = wanted.get(key)?.id || key;
    cards[id] = {
      eur: row.eur,
      version: versionFromId(id),
      url: cardmarketSearchUrl(id,row.name),
      sourceUrl: ROOT + "/colours/" + row.colour,
      source: "OnePiecePrices / Cardmarket EU feed"
    };
  }

  const payload = {
    schemaVersion: 6,
    updatedAt: new Date().toISOString(),
    source: "OnePiecePrices — current Cardmarket EU feed",
    sourcePage: ROOT + "/colours",
    cards,
    stats: {
      catalogCards: wanted.size,
      priceCards: Object.keys(cards).length,
      coverage: Number((Object.keys(cards).length / Math.max(1,wanted.size)).toFixed(4)),
      colourPages: COLOURS.length
    }
  };

  if (Object.keys(cards).length < 2500 || Object.keys(cards).length / Math.max(1,wanted.size) < 0.45) {
    throw new Error("Safety check failed: only " + Object.keys(cards).length + "/" + wanted.size + " local cards priced");
  }

  await fs.writeFile(new URL("../data/cardmarket-prices.json", import.meta.url), JSON.stringify(payload,null,2) + "\n", "utf8");
  console.log(JSON.stringify(payload.stats));
}
main().catch(error => {console.error(error);process.exit(1)});
