import fs from "node:fs/promises";

const ROOT = "https://www.tcggo.com";
const CONCURRENCY = 8;
const REQUEST_TIMEOUT = 25000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function ascii(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function cardBaseId(id) {
  return String(id ?? "").trim().toUpperCase().replace(/_(?:P|R|C)\d+$/i, "");
}
function suffixVersion(id) {
  const m = String(id ?? "").match(/_(?:P|R|C)(\d+)$/i);
  return m ? Number(m[1]) + 1 : 1;
}
function slug(value, punctuationMode = "normal") {
  let s = ascii(value).replace(/[’']/g, "");
  if (punctuationMode === "compact") s = s.replace(/[.]/g, "");
  else s = s.replace(/[.]/g, "");
  return s.replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function cardmarketSlug(value) {
  return slug(value, "compact");
}
function cardmarketUrl(row) {
  const setSlug = cardmarketSlug(row.setName);
  const nameSlug = cardmarketSlug(row.name);
  const number = String(row.cardNumber || "").toUpperCase();
  return "https://www.cardmarket.com/es/OnePiece/Products/Singles/" +
    setSlug + "/" + nameSlug + "-" + number + "-V" + row.version;
}
function parseEurPrice(text) {
  const m = String(text ?? "").match(/([0-9][0-9.,]*)\s*€/);
  if (!m) return null;
  const normalized = m[1].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
function htmlDecode(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
function textContent(html) {
  return htmlDecode(String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}
function absoluteUrl(href, base = ROOT) {
  try { return new URL(htmlDecode(href), base).toString(); } catch { return ""; }
}
async function fetchText(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "MiAlbumOnePiece-CardmarketUpdater/2.0",
        "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return await response.text();
  } catch (error) {
    if (attempt >= 3) throw error;
    await sleep(500 * attempt);
    return fetchText(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}
function parseCollectorNumber(line, fallbackSetCode) {
  const clean = textContent(line).toUpperCase();
  const patterns = [
    /\b((?:OP|EB|ST|PRB)\d{2}[- ]\d{1,4}[A-Z*]*)\b/,
    /\b((?:P|EX|DON)[-_ ]\d{1,4}[A-Z*]*)\b/,
    /\b((?:OP|EB|ST|PRB)\d{2})[- ]?(\d{1,4}[A-Z*]*)\b/
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m) return m[1].includes("-") && /^(OP|EB|ST|PRB)\d{2}-/.test(m[1]) ? m[1] : m[1] + (m[2] ? "-" + m[2] : "");
  }
  const compactSet = String(fallbackSetCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = clean.match(/\b(\d{1,4}[A-Z*]*)\b/);
  return compactSet && m ? compactSet + "-" + m[1] : "";
}
function parseVersion(blockText) {
  const m = String(blockText).match(/\bV\.(\d+)\b/i);
  return m ? Number(m[1]) : 1;
}
function parseSetCodeFromNumber(cardNumber) {
  const m = String(cardNumber).toUpperCase().match(/^((?:OP|EB|ST|PRB)\d{2})-/);
  return m ? m[1] : "";
}
function parseCardsFromSetPage(html, fallbackSetCode, setName, sourceUrl) {
  const rows = [];
  const blocks = String(html).match(/<div[^>]*class=["'][^"']*t1-card[^"']*game-one-piece[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi) || [];
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*font-semibold[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!hrefMatch) continue;
    const href = absoluteUrl(hrefMatch[1], sourceUrl);
    const name = textContent(hrefMatch[2]);
    const paragraphs = [...block.matchAll(/<p[^>]*class=["'][^"']*text-xs[^"']*text-slate-400[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => textContent(m[1]));
    const codeLine = paragraphs[1] || paragraphs.find(x => /(?:OP|EB|ST|PRB|P|EX|DON)/i.test(x)) || "";
    const cardNumber = parseCollectorNumber(codeLine || block, fallbackSetCode);
    if (!cardNumber) continue;
    const priceMatch = block.match(/<[^>]*class=["'][^"']*font-display[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const price = parseEurPrice(textContent(priceMatch?.[1] || block));
    if (price === null) continue;
    const version = parseVersion(textContent(block));
    const resolvedSet = parseSetCodeFromNumber(cardNumber) || String(fallbackSetCode || "").toUpperCase();
    rows.push({
      name,
      cardNumber,
      version,
      eur: price,
      setCode: resolvedSet,
      setName,
      sourceUrl: href
    });
  }
  return rows;
}
function findPaginationUrls(html, pageUrl) {
  const urls = new Set();
  for (const match of String(html).matchAll(/href=["']([^"']+)["']/gi)) {
    const u = absoluteUrl(match[1], pageUrl);
    if (/\/singles(?:\/page\/\d+)?(?:\?.*(?:page|p)=\d+)?$/i.test(u)) urls.add(u);
  }
  return [...urls];
}
async function parseSetSingles(setUrl, setCode, setName) {
  const all = [];
  const seen = new Set();
  const queue = [setUrl.replace(/\/$/, "") + "/singles"];
  while (queue.length && seen.size < 100) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const html = await fetchText(url);
      all.push(...parseCardsFromSetPage(html, setCode, setName, url));
      for (const next of findPaginationUrls(html, url)) if (!seen.has(next)) queue.push(next);
    } catch {}
  }
  return all;
}
function discoverLinks(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/href=["']([^"']+)["']/gi)) {
    const u = absoluteUrl(m[1], base);
    if (u) out.push(u.replace(/\/$/, ""));
  }
  return [...new Set(out)];
}
async function discoverSetCandidates(packs) {
  const found = new Map();
  const add = (slugValue, code, name) => {
    const s = String(slugValue || "").replace(/^\/+|\/+$/g, "");
    if (!s) return;
    if (/^https?:/i.test(s)) {
      try {
        const u = new URL(s);
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length >= 2 && parts[0] === "one-piece") s = parts[1];
      } catch {}
    }
    found.set(s, {code: code || "", name: name || ""});
  };

  for (const p of packs) {
    add(slug(p.name), p.code, p.name);
  }

  for (const page of [ROOT + "/one-piece/episodes", ROOT + "/one-piece"]) {
    try {
      const html = await fetchText(page);
      for (const u of discoverLinks(html, page)) {
        const m = u.match(/\/one-piece\/([^/]+)(?:\/singles)?$/i);
        if (!m || !m[1] || /^(episodes|one-piece|search)$/i.test(m[1])) continue;
        const name = packs.find(p => slug(p.name) === m[1])?.name || m[1].replace(/-/g, " ");
        const code = packs.find(p => slug(p.name) === m[1])?.code || "";
        add(m[1], code, name);
      }
    } catch {}
  }

  const candidates = [...found.entries()];
  const valid = new Map();
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, candidates.length)}, async () => {
    while (true) {
      const i = cursor++;
      if (i >= candidates.length) return;
      const [s, info] = candidates[i];
      try {
        const html = await fetchText(ROOT + "/one-piece/" + s + "/singles");
        if (!/t1-card|game-one-piece/i.test(html)) continue;
        const title = htmlDecode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s*-\s*TCGGO\.com\s*$/i, "").trim();
        valid.set(s, {code: info.code, name: title || info.name || s.replace(/-/g, " ")});
      } catch {}
    }
  }));
  return valid;
}
function loadJsonFile(path) {
  return fs.readFile(path, "utf8").then(JSON.parse);
}
function localCardsById(cards) {
  return new Map(cards.map(c => [String(c.id || "").trim().toUpperCase(), c]));
}
function mapToLocal(localCards, sourceRows) {
  const byBase = new Map();
  for (const row of sourceRows) {
    const base = cardBaseId(row.cardNumber);
    const key = base.toUpperCase();
    if (!byBase.has(key)) byBase.set(key, new Map());
    byBase.get(key).set(row.version, row);
  }

  const output = {};
  let mapped = 0;
  let missing = 0;
  for (const c of localCards) {
    const id = String(c.id || "").trim();
    if (!id) continue;
    const base = cardBaseId(id);
    const version = suffixVersion(id);
    const row = byBase.get(base.toUpperCase())?.get(version);
    if (!row) {
      missing++;
      continue;
    }
    output[id] = {
      eur: row.eur,
      version: row.version,
      cardmarketId: null,
      url: cardmarketUrl(row),
      sourceUrl: row.sourceUrl,
      setCode: row.setCode,
      cardNumber: row.cardNumber
    };
    mapped++;
  }
  return {output, mapped, missing};
}

async function main() {
  const updatedAt = new Date().toISOString();
  const cards = await loadJsonFile(new URL("../data/cards.json", import.meta.url));
  const packs = await loadJsonFile(new URL("../data/packs.json", import.meta.url));
  const localCards = (Array.isArray(cards) ? cards : Object.values(cards || {}))
    .map(c => ({...c, id: String(c?.id || "").trim()})).filter(c => c.id);
  const localPacks = (Array.isArray(packs) ? packs : Object.values(packs || {}))
    .map(p => ({...p, code: String(p?.code || "").trim(), name: String(p?.name || "").trim()}))
    .filter(p => p.code);

  const setCandidates = await discoverSetCandidates(localPacks);
  if (!setCandidates.size) throw new Error("No TCGGO One Piece expansion pages discovered");

  const candidates = [...setCandidates.entries()];
  let cursor = 0;
  const sourceRows = [];
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, candidates.length)}, async () => {
    while (true) {
      const i = cursor++;
      if (i >= candidates.length) return;
      const [setSlug, info] = candidates[i];
      const rows = await parseSetSingles(ROOT + "/one-piece/" + setSlug + "/singles", info.code, info.name);
      sourceRows.push(...rows);
    }
  }));

  const dedupe = new Map();
  for (const row of sourceRows) {
    const key = row.cardNumber.toUpperCase() + "|V" + row.version;
    const old = dedupe.get(key);
    if (!old || row.eur !== null) dedupe.set(key, row);
  }
  const uniqueSource = [...dedupe.values()];
  const result = mapToLocal(localCards, uniqueSource);

  const payload = {
    schemaVersion: 4,
    updatedAt,
    source: "TCGGO Cardmarket EU English (public HTML)",
    sourcePage: ROOT + "/one-piece/one-piece",
    cards: result.output,
    stats: {
      catalogCards: localCards.length,
      sourceCardsParsed: uniqueSource.length,
      mapped: result.mapped,
      missing: result.missing,
      expansionsDiscovered: setCandidates.size
    }
  };
  if (result.mapped < 1000) {
    throw new Error("Safety check failed: only " + result.mapped + " local cards mapped from TCGGO");
  }
  await fs.mkdir(new URL("../data", import.meta.url), {recursive:true});
  await fs.writeFile(new URL("../data/cardmarket-prices.json", import.meta.url), JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(payload.stats));
}
main().catch(error => { console.error(error); process.exit(1); });
