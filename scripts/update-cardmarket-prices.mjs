import fs from "node:fs/promises";

const ROOT = "https://onepieceprices.io";
const CONCURRENCY = 8;
const REQUEST_TIMEOUT = 30000;

function norm(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function localIdFromSlug(slug) {
  const parts = String(slug || "").toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return "";
  let base = "";
  if (/^(op|eb|st|prb)\d{2}$/.test(parts[0]) && parts[1]) {
    base = parts[0].toUpperCase() + "-" + parts[1].toUpperCase();
  } else if (/^(p|ex|don)$/.test(parts[0]) && parts[1]) {
    base = parts[0].toUpperCase() + "-" + parts[1].toUpperCase();
  } else {
    return "";
  }
  if (/^[prc]\d+$/i.test(parts[2] || "")) base += "_" + parts[2].toUpperCase();
  return base;
}
function slugFromLocalId(id) {
  return String(id || "").toLowerCase().replace(/_/g, "-");
}
function versionFromId(id) {
  const m = String(id || "").match(/_(?:p|r|c)(\d+)$/i);
  return m ? Number(m[1]) + 1 : 1;
}
function parseEuroPrice(html) {
  const matches = [...String(html).matchAll(/€\s*([0-9][0-9.,]*)/g)];
  for (const m of matches) {
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
      headers: {
        "user-agent": "MiAlbumOnePiece/1.0 (+Cardmarket price updater)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return await r.text();
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise(resolve => setTimeout(resolve, 700 * attempt));
    return fetchText(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}
function discoverSetSlugs(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/href=["']\/set\/([^"'/?#]+)["']/gi)) {
    const slug = String(m[1]).trim().toLowerCase();
    if (slug && slug !== "all") out.add(slug);
  }
  return [...out];
}
function extractCardRows(html, setSlug) {
  const source = String(html);
  const rows = [];
  for (const m of source.matchAll(/<a[^>]+href=["']\/set\/([^"'/?#]+)\/card\/([^"'/?#]+)["'][^>]*>/gi)) {
    const slug = decodeURIComponent(m[2]);
    const hrefSet = String(m[1]).toLowerCase();
    if (hrefSet !== String(setSlug).toLowerCase()) continue;
    const start = m.index + m[0].length;
    const end = source.indexOf("</a>", start);
    const block = source.slice(start, end > start ? end : Math.min(source.length, start + 5000));
    const id = localIdFromSlug(slug);
    if (!id) continue;
    const eur = parseEuroPrice(block);
    if (eur === null) continue;
    rows.push({id, eur, setSlug});
  }
  return rows;
}
function cardmarketSearchUrl(id, name = "") {
  const version = versionFromId(id);
  const base = String(id || "").replace(/_(?:p|r|c)\d+$/i, "");
  const q = [name, base, "(V." + version + ")"].filter(Boolean).join(" ");
  return "https://www.cardmarket.com/es/OnePiece/Products/Singles?mode=list&searchString=" + encodeURIComponent(q);
}
async function main() {
  const localRaw = await fs.readFile(new URL("../data/cards.json", import.meta.url), "utf8");
  const parsed = JSON.parse(localRaw);
  const localCards = Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed || {}).map(([id, card]) => ({...(card || {}), id: card?.id || id}));
  const wanted = new Map(localCards.filter(c => c?.id).map(c => [String(c.id).toUpperCase(), c]));

  const browse = await fetchText(ROOT + "/browse");
  const setSlugs = discoverSetSlugs(browse);
  if (!setSlugs.length) throw new Error("No OnePiecePrices set pages discovered");

  const discovered = new Map();
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, setSlugs.length)}, async () => {
    while (true) {
      const i = cursor++;
      if (i >= setSlugs.length) return;
      const setSlug = setSlugs[i];
      try {
        const html = await fetchText(ROOT + "/set/" + setSlug);
        for (const row of extractCardRows(html, setSlug)) {
          const key = row.id.toUpperCase();
          if (!wanted.has(key)) continue;
          if (!discovered.has(key)) discovered.set(key, {...row, name: wanted.get(key)?.name || ""});
        }
      } catch (e) {
        console.warn("set fetch failed", setSlug, String(e));
      }
    }
  }));

  const cards = {};
  for (const [key, row] of discovered.entries()) {
    const id = wanted.get(key)?.id || key;
    cards[id] = {
      eur: row.eur,
      version: versionFromId(id),
      url: cardmarketSearchUrl(id, row.name),
      sourceUrl: ROOT + "/set/" + row.setSlug,
      source: "OnePiecePrices / Cardmarket EU feed"
    };
  }

  const coverage = Object.keys(cards).length / Math.max(1, wanted.size);
  const payload = {
    schemaVersion: 5,
    updatedAt: new Date().toISOString(),
    source: "OnePiecePrices — current Cardmarket EU feed",
    sourcePage: ROOT + "/browse",
    cards,
    stats: {
      catalogCards: wanted.size,
      priceCards: Object.keys(cards).length,
      coverage: Number(coverage.toFixed(4)),
      setPages: setSlugs.length
    }
  };

  if (Object.keys(cards).length < 2500 || coverage < 0.45) {
    throw new Error("Safety check failed: only " + Object.keys(cards).length + "/" + wanted.size + " local cards priced");
  }

  await fs.writeFile(new URL("../data/cardmarket-prices.json", import.meta.url), JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(payload.stats));
}
main().catch(error => {
  console.error(error);
  process.exit(1);
});
