import fs from "node:fs/promises";
import process from "node:process";

const ROOT = "https://www.tcggo.com";
const OUT = new URL("../data/cardmarket-prices.json", import.meta.url);
const MAX_SITEMAPS = 60;
const CONCURRENCY = 12;
const REQUEST_TIMEOUT = 25000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function upper(value) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}
function entityDecode(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
function htmlText(html) {
  return entityDecode(String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function absoluteUrl(href, base = ROOT) {
  try { return new URL(entityDecode(href), base).toString(); } catch { return ""; }
}
async function fetchText(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "MiAlbumOnePiece-CardmarketUpdater/1.0 (+https://one-piece-card-market.vercel.app)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return await response.text();
  } catch (error) {
    if (attempt >= 3) throw error;
    await sleep(700 * attempt);
    return fetchText(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}
function extractLocs(xml, base) {
  const out = [];
  for (const match of String(xml).matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    const u = absoluteUrl(match[1], base);
    if (u) out.push(u);
  }
  return [...new Set(out)];
}
function isSitemapIndex(xml) {
  return /<sitemapindex\b/i.test(xml);
}
function isOnePieceCardUrl(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (p.length !== 3 || p[0] !== "one-piece") return false;
    const banned = new Set(["episodes","singles","products","binder","top_drops","trending","favourites","highest_price","lowest_price","last_added","score","one-piece"]);
    return !banned.has(p[2]);
  } catch { return false; }
}
function setSlugFromCardUrl(url) {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    return p.length === 3 ? p[1] : "";
  } catch { return ""; }
}
function parseSetCode(text) {
  const m = String(text).match(/\b(?:OP|EB|ST|PRB)[- ]?\d{1,2}\b/i);
  if (!m) return "";
  const x = m[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
  const mm = x.match(/^(OP|EB|ST|PRB)(\d{1,2})$/);
  return mm ? mm[1] + String(mm[2]).padStart(2, "0") : "";
}
function normalizeSetCode(value) {
  const s = upper(value);
  if (!s) return "";
  let m = s.match(/^OP(\d{1,2})(?:-EB\d{1,2})?$/);
  if (m) return "OP" + String(m[1]).padStart(2, "0");
  m = s.match(/^OP-?(\d{1,2})$/);
  if (m) return "OP" + String(m[1]).padStart(2, "0");
  m = s.match(/^EB-?(\d{1,2})$/);
  if (m) return "EB" + String(m[1]).padStart(2, "0");
  m = s.match(/^ST-?(\d{1,2})$/);
  if (m) return "ST" + String(m[1]).padStart(2, "0");
  m = s.match(/^PRB-?(\d{1,2})$/);
  if (m) return "PRB" + String(m[1]).padStart(2, "0");
  return s.replace(/[^A-Z0-9]/g, "");
}
function sourceCardKey(setCode, cardNumber) {
  return normalizeSetCode(setCode) + "|" + upper(cardNumber);
}
function parseCardPage(url, html, setInfo) {
  const setCode = setInfo?.code || "";
  const setNameForRow = setInfo?.name || "";
  const text = htmlText(html);
  const versionMatch = text.match(/(?:Version\s+)?V\.(\d+)/i);
  const version = versionMatch ? Number(versionMatch[1]) : 1;
  const cm = text.match(/Cardmarket ID\s+(\d+)/i);
  const cardmarketId = cm ? cm[1] : "";
  const numberMatch =
    text.match(/Card number\s+([A-Z0-9][A-Z0-9_-]*)/i) ||
    text.match(/\b((?:OP|EB|ST|PRB)\d{2}[- ](?:[A-Z0-9-]+))\s+V\.\d+/i) ||
    text.match(/\b((?:OP|EB|ST|PRB)\d{2}[- ]\d{3})\b/i);
  let cardNumber = numberMatch ? numberMatch[1].replace(/ /g, "-").toUpperCase() : "";
  if (!cardNumber) {
    const idMatch = text.match(/\b(?:OP|EB|ST|PRB)\d{2}\s+(\d{3})\s+V\.\d+/i);
    if (idMatch) cardNumber = idMatch[1];
  }
  if (!cardNumber) {
    const m = url.match(/\/([^/]+)$/);
    cardNumber = m ? m[1].toUpperCase() : "";
  }
  if (/^(OP|EB|ST|PRB)\d{2}-\d{3}$/i.test(cardNumber)) {
    cardNumber = cardNumber.slice(7);
  }
  if (!cardNumber || !cardmarketId) return null;

  const euSection = text.match(/EU Prices[\s\S]{0,2200}?(?:US Prices|Price history|RAW Prices)/i)?.[0] || text;
  const priceMatch =
    euSection.match(/English\s+Europe\s+([0-9][0-9.,]*)\s*€/i) ||
    euSection.match(/English\s+English\s+Europe\s+([0-9][0-9.,]*)\s*€/i) ||
    euSection.match(/English[\s\S]{0,160}?Europe\s+([0-9][0-9.,]*)\s*€/i);
  if (!priceMatch) return null;
  const rawPrice = priceMatch[1].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const eur = Number(rawPrice);
  if (!Number.isFinite(eur)) return null;

  const nameMatch = text.match(/\bName\s+(.+?)\s+Rare\b/i);
  const name = nameMatch ? nameMatch[1].trim() : "";
  let marketUrl = "";
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const u = absoluteUrl(match[1], url);
    if (/cardmarket\.com\//i.test(u) && /Products\/Singles/i.test(u)) {
      marketUrl = u;
      break;
    }
  }
  return {
    url,
    setCode: normalizeSetCode(setCode),
    cardNumber: upper(cardNumber),
    version,
    name,
    eur,
    cardmarketId,
    cardmarketUrl: marketUrl || "https://www.cardmarket.com/es/OnePiece/Products/Singles/" + marketSlug(setNameForRow) + "/" + marketSlug(name + "-" + (cardNumber.match(/^\d{3}$/) ? normalizeSetCode(setCode) + "-" + cardNumber : cardNumber) + "-V" + version)
  };
}
async function discoverSitemaps() {
  const queue = [ROOT + "/sitemap.xml", ROOT + "/sitemap_index.xml"];
  const seen = new Set();
  const pages = [];
  while (queue.length && seen.size < MAX_SITEMAPS) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const xml = await fetchText(url);
      const locs = extractLocs(xml, url);
      if (isSitemapIndex(xml) || locs.some(x => /sitemap/i.test(x))) queue.push(...locs);
      else pages.push(...locs);
    } catch {}
  }
  return [...new Set(pages)].filter(isOnePieceCardUrl);
}
async function discoverFallbackCardUrls() {
  const episodeHtml = await fetchText(ROOT + "/one-piece/episodes");
  const setUrls = [...new Set([...episodeHtml.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
    .map(m => absoluteUrl(m[1], ROOT))
    .filter(u => /^https:\/\/www\.tcggo\.com\/one-piece\/[^/]+\/?$/i.test(u)))];
  const result = new Set();
  for (const setUrl of setUrls) {
    let next = setUrl.replace(/\/$/, "") + "/singles";
    const seen = new Set();
    for (let safety = 0; safety < 500 && next; safety++) {
      if (seen.has(next)) break;
      seen.add(next);
      let html;
      try { html = await fetchText(next); } catch { break; }
      for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
        const u = absoluteUrl(m[1], next);
        if (isOnePieceCardUrl(u)) result.add(u);
      }
      const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => absoluteUrl(m[1], next));
      next = links.find(u => /\/singles(?:\/page\/\d+)?(?:\?.*?(?:page|p)=\d+)?$/i.test(u) && !seen.has(u)) || "";
    }
  }
  return [...result];
}
async function mapSetSlugs(slugs) {
  const out = new Map();
  let cursor = 0;
  const workers = Math.min(8, slugs.length);
  await Promise.all(Array.from({length: workers}, async () => {
    while (true) {
      const i = cursor++;
      if (i >= slugs.length) return;
      const slug = slugs[i];
      try {
        const html = await fetchText(ROOT + "/one-piece/" + slug);
        const text = htmlText(html);
        const code = parseSetCode(text);
        if (code) out.set(slug, {code, name: pageTitle(html)});
      } catch {}
    }
  }));
  return out;
}
async function fetchCardPages(urls, setMap) {
  const out = [];
  let cursor = 0;
  const workers = Math.min(CONCURRENCY, urls.length);
  let failures = 0;
  await Promise.all(Array.from({length: workers}, async () => {
    while (true) {
      const i = cursor++;
      if (i >= urls.length) return;
      const url = urls[i];
      const slug = setSlugFromCardUrl(url);
      const setInfo = setMap.get(slug);
      if (!setInfo?.code) { failures++; continue; }
      try {
        const html = await fetchText(url);
        const row = parseCardPage(url, html, setInfo);
        if (row) out.push(row);
      } catch { failures++; }
    }
  }));
  return {rows: out, failures};
}
function loadLocalCards(raw) {
  const parsed = JSON.parse(raw);
  const arr = Array.isArray(parsed) ? parsed : Object.entries(parsed || {}).map(([key, value]) => ({...(value || {}), id: value?.id || key}));
  return arr.map(c => ({...c, id: String(c.id || "").trim()})).filter(c => c.id);
}
function pageTitle(html) {
  return entityDecode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s*-\s*TCGGO\.com\s*$/i, "").trim();
}
function marketSlug(value) {
  return normalize(value).replace(/[’\']/g, "").replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function cardIdFromSource(row) {
  let base = upper(row.cardNumber);
  if (/^\d{3}$/.test(base)) base = normalizeSetCode(row.setCode) + "-" + base;
  base = base.replace(/ /g, "-");
  if (!base) return "";
  return row.version <= 1 ? base : base + "_p" + (row.version - 1);
}
function sourceRank(row) {
  const id = cardIdFromSource(row);
  const prefix = normalizeSetCode(row.setCode) + "-";
  return (id.startsWith(prefix) ? 10 : 0) + (row.cardmarketUrl ? 2 : 0);
}
function buildPriceDataset(sourceRows) {
  const best = new Map();
  for (const row of sourceRows) {
    const id = cardIdFromSource(row);
    if (!id || !Number.isFinite(row.eur)) continue;
    const current = best.get(id);
    if (!current || sourceRank(row) > sourceRank(current)) best.set(id, row);
  }
  const cards = {};
  for (const [id, row] of [...best.entries()].sort(([a], [b]) => a.localeCompare(b, "en", {numeric:true}))) {
    cards[id] = {
      eur: row.eur,
      cardmarketId: row.cardmarketId,
      url: row.cardmarketUrl,
      version: row.version,
      sourceUrl: row.url,
      setCode: row.setCode,
      cardNumber: row.cardNumber
    };
  }
  return cards;
}
async function main() {
  const started = new Date().toISOString();
  const sitemapUrls = await discoverSitemaps();
  const cardUrls = sitemapUrls.length ? sitemapUrls : await discoverFallbackCardUrls();
  if (!cardUrls.length) throw new Error("No TCGGO One Piece card pages discovered");

  const slugs = [...new Set(cardUrls.map(setSlugFromCardUrl).filter(Boolean))];
  const setMap = await mapSetSlugs(slugs);
  const source = await fetchCardPages(cardUrls, setMap);
  if (!source.rows.length) throw new Error("No TCGGO card prices parsed");

  const cards = buildPriceDataset(source.rows);

  const payload = {
    schemaVersion: 3,
    updatedAt: new Date().toISOString(),
    source: "TCGGO Cardmarket EU English",
    sourcePage: ROOT + "/one-piece",
    cards,
    stats: {
      sourceCardsParsed: source.rows.length,
      mapped: Object.keys(cards).length,
      missing: 0,
      ambiguous: 0,
      fetchFailures: source.failures,
      discoveredUrls: cardUrls.length,
      setPages: setMap.size
    }
  };

  if (Object.keys(cards).length < 1000) {
    throw new Error("Safety check failed: only " + Object.keys(cards).length + " Cardmarket versions mapped");
  }

  await fs.mkdir(new URL("../data", import.meta.url), {recursive:true});
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(payload.stats));
}
main().catch(error => { console.error(error); process.exit(1); });
