import fs from "node:fs/promises";

const PRODUCT_URL = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const PRICE_URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";
const REQUEST_TIMEOUT = 120000;
const MIN_COVERAGE = 0.90;
const REMOTE_CARDS_URL = "https://raw.githubusercontent.com/michalkiral/optcg-data/main/data/index/cards_by_id.json";
const REMOTE_PACKS_URL = "https://raw.githubusercontent.com/michalkiral/optcg-data/main/data/packs.json";
const REMOTE_OP17_URL = "https://raw.githubusercontent.com/hugoprudente/optcgjson/main/output/OP17.json";

const CARDMARKET_SET_NAMES = {
  "OP-01": ["Romance Dawn"],
  "OP-02": ["Paramount War"],
  "OP-03": ["Pillars of Strength"],
  "OP-04": ["Kingdoms of Intrigue"],
  "OP-05": ["Awakening of the New Era"],
  "OP-06": ["Wings of the Captain"],
  "OP-07": ["500 Years in the Future"],
  "OP-08": ["Two Legends"],
  "OP-09": ["Emperors in the New World"],
  "OP-10": ["Royal Blood"],
  "OP-11": ["A Fist of Divine Speed"],
  "OP-12": ["Legacy of the Master"],
  "OP-13": ["Carrying on His Will"],
  "OP-14": ["The Azure Sea's Seven", "The Azure Sea’s Seven"],
  "OP14-EB04": ["The Azure Sea's Seven", "The Azure Sea’s Seven"],
  "OP15-EB04": ["Adventure on Kamis Island", "Adventure on Kami's Island", "Adventure on Kami’s Island"],
  "OP-16": ["The Time of Battle"],
  "EB-01": ["Memorial Collection"],
  "EB-02": ["Anime 25th Collection"],
  "EB-03": ["One Piece Heroines Edition"],
  "PRB-01": ["One Piece Card The Best", "The Best"],
  "PRB-02": ["One Piece Card The Best Vol.2", "The Best Vol.2"],
  "ST-01": ["Starter Deck Straw Hat Crew"],
  "ST-02": ["Starter Deck Worst Generation"],
  "ST-03": ["Starter Deck The Seven Warlords of the Sea"],
  "ST-04": ["Starter Deck Animal Kingdom Pirates"],
  "ST-05": ["Starter Deck ONE PIECE FILM edition"],
  "ST-06": ["Starter Deck Absolute Justice"],
  "ST-07": ["Starter Deck Big Mom Pirates"],
  "ST-08": ["Starter Deck Monkey D Luffy"],
  "ST-09": ["Starter Deck Yamato"],
  "ST-10": ["Starter Deck The Three Captains"],
  "ST-11": ["Starter Deck Uta"],
  "ST-12": ["Starter Deck Zoro and Sanji"],
  "ST-13": ["Starter Deck The Three Brothers"],
  "ST-14": ["Starter Deck 3D2Y"],
  "ST-15": ["Starter Deck Red Edward Newgate"],
  "ST-16": ["Starter Deck Green Uta"],
  "ST-17": ["Starter Deck Blue Donquixote Doflamingo"],
  "ST-18": ["Starter Deck Purple Monkey D Luffy"],
  "ST-19": ["Starter Deck Black Smoker"],
  "ST-20": ["Starter Deck Yellow Charlotte Katakuri"],
  "ST-21": ["Starter Deck GEAR5"],
  "ST-22": ["Starter Deck Ace & Newgate"],
  "ST-23": ["Starter Deck RED Shanks"],
  "ST-24": ["Starter Deck GREEN Jewelry Bonney"],
  "ST-25": ["Starter Deck BLUE Buggy"],
  "ST-26": ["Starter Deck PURPLE BLACK Monkey D Luffy"],
  "ST-27": ["Starter Deck BLACK Marshall D Teach"],
  "ST-28": ["Starter Deck GREEN YELLOW Yamato"],
  "ST-29": ["Starter Deck Egghead"],
  "ST-30": ["Starter Deck Luffy & Ace"],
  "ST-31": ["Starter Deck RED Monkey D Luffy"],
  "ST-32": ["Starter Deck GREEN Roronoa Zoro"],
  "ST-33": ["Starter Deck BLUE Kuzan"],
  "ST-34": ["Starter Deck PURPLE Charlotte Katakuri"],
  "ST-35": ["Starter Deck RED BLACK Sabo"],
  "ST-36": ["Starter Deck YELLOW Eustass Captain Kid"]
};

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numberPart(id) {
  const m = String(id || "").toUpperCase().match(/(?:^|[- ])(\d{3})$/);
  return m ? m[1] : "";
}

function baseId(id) {
  return String(id || "").trim().replace(/_(?:p|r|c|jp)\d+$/i, "");
}

function localVersion(id) {
  const m = String(id || "").match(/_(?:p|r|c|jp)(\d+)$/i);
  return m ? Number(m[1]) + 1 : 1;
}

function productVersion(name) {
  const m = String(name || "").match(/\(\s*V\.?\s*(\d+)\s*\)/i);
  return m ? Number(m[1]) : null;
}

function buildProductVersionIndex(products) {
  const groups = new Map();
  for (const product of products) {
    if (!product?.idProduct) continue;
    const expansion = String(product.idExpansion ?? "");
    const metacard = String(product.idMetacard ?? "");
    if (!expansion || !metacard) continue;
    const key = expansion + "|" + metacard;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }

  const versions = new Map();
  for (const [key, group] of groups.entries()) {
    const ordered = [...group].sort((a, b) =>
      String(a.dateAdded || "").localeCompare(String(b.dateAdded || "")) ||
      Number(a.idProduct) - Number(b.idProduct)
    );
    let next = 1;
    for (const product of ordered) {
      const explicit = productVersion(product.name);
      versions.set(String(product.idProduct), explicit ?? next);
      next = Math.max(next, (explicit ?? next) + 1);
    }
  }
  return versions;
}

function isJapaneseExpansion(value) {
  const s = String(value ?? "").toUpperCase();
  return /(?:^|[-_ ])JP(?:$|[-_ ])/.test(s)
    || /\bJAPANESE\b/.test(s)
    || /\bNON[ -]?ENGLISH\b/.test(s)
    || /\bASIA[ -]+REGION[ -]+LEGAL\b/.test(s);
}

function isJapaneseCard(card) {
  return isJapaneseExpansion(card?.id) || isJapaneseExpansion(card?.set) || isJapaneseExpansion(card?.set_name);
}

function isEnglishProduct(product, japaneseExpansionIds = null) {
  if (isJapaneseExpansion(product?.expansionName) || isJapaneseExpansion(product?.name)) return false;
  if (japaneseExpansionIds && japaneseExpansionIds.has(Number(product?.idExpansion))) return false;
  return true;
}

function collectJapaneseExpansionIds(products) {
  const ids = new Set();
  for (const product of products) {
    const id = Number(product?.idExpansion);
    if (!Number.isFinite(id)) continue;
    if (isJapaneseExpansion(product?.expansionName) || isJapaneseExpansion(product?.name)) {
      ids.add(id);
    }
  }
  return ids;
}

function sourceSetCode(card) {
  const code = extractCardCode(baseId(card?.id));
  if (!code) return String(card?.set || "").toUpperCase();
  const prefix = code.split("-")[0];
  const m = prefix.match(/^(OP|EB|ST|PRB)(\d{2})$/i);
  return m ? m[1].toUpperCase() + "-" + m[2] : prefix.toUpperCase();
}

function cardmarketCardUrl(card) {
  const code = extractCardCode(baseId(card?.id));
  const slug = norm(card?.name || "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!code || !slug) return "https://www.cardmarket.com/es/OnePiece/Cards";
  return "https://www.cardmarket.com/es/OnePiece/Cards/" + slug + "-" + code;
}


function extractCardCode(text) {
  const m = String(text || "").toUpperCase().match(/\b((?:OP|EB|ST|PRB)\d{2})[- ](\d{3})\b/);
  return m ? m[1] + "-" + m[2] : null;
}

function expansionMatches(setCode, expansionName, localSetName = "") {
  const wanted = [...(CARDMARKET_SET_NAMES[setCode] || []), localSetName];
  const target = norm(expansionName);
  if (!target) return false;
  return wanted.some(name => {
    const candidate = norm(name);
    return candidate && (candidate === target || candidate.includes(target) || target.includes(candidate));
  });
}

function readProducts(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : [];
}

function readPrices(data) {
  return Array.isArray(data)
    ? data
    : Array.isArray(data?.priceGuides)
      ? data.priceGuides
      : Array.isArray(data?.prices)
        ? data.prices
        : [];
}

async function fetchJson(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "user-agent": "MiAlbumOnePiece/1.0 (+daily Cardmarket catalog)"
      }
    });
    if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
    return await response.json();
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    return fetchJson(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

function priceNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function cleanProductName(name) {
  return norm(String(name || "")
    .replace(/\(\s*(?:OP|EB|ST|PRB)\d{2}[- ]\d{3}\s*\)/gi, "")
    .replace(/\(\s*V\.?\s*\d+\s*\)/gi, ""));
}

function cardNameMatches(card, product) {
  const wanted = norm(card?.name);
  if (!wanted) return 0;
  const actual = cleanProductName(product?.name);
  if (!actual) return 0;
  if (actual === wanted) return 6;
  if (actual.includes(wanted) || wanted.includes(actual)) return 3;
  return 0;
}

function candidateScore(card, product, productVersions) {
  const cardBase = baseId(card.id).toUpperCase();
  const code = extractCardCode(product?.name);
  const cardCode = extractCardCode(cardBase);
  if (code && cardCode && code !== cardCode) return -1000;

  let score = 0;
  if (code && cardCode && code === cardCode) score += 40;

  const pNumber = String(product?.number ?? "").trim().replace(/^0+/, "") || "0";
  const cNumber = numberPart(cardBase).replace(/^0+/, "") || "0";
  if (pNumber === cNumber) score += 20;

  if (expansionMatches(String(card.set || "").toUpperCase(), product?.expansionName)) score += 35;
  if (cardNameMatches(card, product)) score += cardNameMatches(card, product);

  const wantedVersion = localVersion(card.id);
  const actualVersion = productVersions?.get(String(product?.idProduct)) ?? productVersion(product?.name);
  if (wantedVersion === actualVersion) score += 50;
  else if (actualVersion !== null && actualVersion !== undefined) score -= 30;

  return score;
}

function chooseProduct(card, productsBySetAndNumber, primaryExpansionBySet, productVersions) {
  const base = baseId(card.id).toUpperCase();
  const cardCode = extractCardCode(base);
  const number = numberPart(base);
  const desiredVersion = localVersion(card.id);
  const sourceSet = sourceSetCode(card);
  const primaryExpansionId = primaryExpansionBySet.get(sourceSet);

  const pool = [];
  for (const product of productsBySetAndNumber) {
    if (!product?.idProduct) continue;
    const code = extractCardCode(product?.name);
    if (code && cardCode) {
      if (code !== cardCode) continue;
    } else if (number) {
      const pNumber = String(product.number ?? "").trim().replace(/^0+/, "");
      if (pNumber !== number.replace(/^0+/, "")) continue;
    } else {
      continue;
    }

    if (primaryExpansionId && Number(product.idExpansion) !== Number(primaryExpansionId)) continue;

    const score = candidateScore(card, product, productVersions);
    if (score > 0) {
      pool.push({
        product,
        score,
        explicitVersion: productVersions?.has(String(product.idProduct)) || productVersion(product.name) !== null,
        version: productVersions?.get(String(product.idProduct)) ?? productVersion(product.name)
      });
    }
  }

  pool.sort((a, b) => b.score - a.score || Number(a.product.idProduct) - Number(b.product.idProduct));
  if (!pool.length) return null;

  const explicitVersions = pool.some(x => x.explicitVersion);
  if (explicitVersions) {
    return pool.find(x => x.version === desiredVersion)?.product || pool[0].product;
  }

  return pool[Math.min(desiredVersion - 1, pool.length - 1)].product;
}
function buildProductIndex(products) {
  const groups = new Map();
  for (const product of products) {
    if (!product || !product.idProduct) continue;
    const keyCode = extractCardCode(product.name);
    const keyNumber = String(product.number ?? "").trim();
    const key = [
      norm(product.expansionName),
      keyCode || keyNumber,
      cleanProductName(product.name)
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return groups;
}

function allProductsForCard(card, products, primaryExpansionBySet, japaneseExpansionIds) {
  const out = [];
  const base = baseId(card.id).toUpperCase();
  const code = extractCardCode(base);
  const number = numberPart(base);
  const sourceSet = sourceSetCode(card);
  const primaryExpansionId = primaryExpansionBySet.get(sourceSet);

  for (const product of products) {
    if (!product?.idProduct || !isEnglishProduct(product, japaneseExpansionIds)) continue;
    const pCode = extractCardCode(product.name);
    if (pCode && code) {
      if (pCode !== code) continue;
    } else {
      if (number) {
        const pNumber = String(product.number ?? "").trim().replace(/^0+/, "");
        if (pNumber !== number.replace(/^0+/, "")) continue;
      } else {
        continue;
      }
    }
    if (primaryExpansionId && Number(product.idExpansion) !== Number(primaryExpansionId)) continue;
    if (cardNameMatches(card, product) <= 0 && !pCode) continue;
    out.push(product);
  }
  return out;
}
function normalizeCardCatalog(parsed) {
  const values = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
  return values.map(card => ({
    ...card,
    id: String(card?.id || "").trim(),
    set: String(card?.set || "").trim().toUpperCase()
  })).filter(card => card.id && card.set && !isJapaneseCard(card));
}

function priceGuideIndex(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = Number(row?.idProduct ?? row?.id_product);
    if (Number.isFinite(id)) map.set(String(id), row);
  }
  return map;
}

async function readPreviousDataset() {
  try {
    return JSON.parse(await fs.readFile(new URL("../data/cardmarket-prices.json", import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

function primaryExpansionMap(products) {
  const counts = new Map();
  const firstSeen = new Map();

  for (const product of products) {
    const code = extractCardCode(product?.name);
    const idExpansion = Number(product?.idExpansion);
    if (!code || !Number.isFinite(idExpansion)) continue;

    const prefix = code.split("-")[0];
    const m = prefix.match(/^(OP|EB|ST|PRB)(\d{2})$/i);
    const setCode = m ? m[1].toUpperCase() + "-" + m[2] : prefix.toUpperCase();

    if (!counts.has(setCode)) counts.set(setCode, new Map());
    const byExpansion = counts.get(setCode);
    byExpansion.set(idExpansion, (byExpansion.get(idExpansion) || 0) + 1);

    const date = String(product?.dateAdded || "");
    const key = setCode + "|" + idExpansion;
    const previous = firstSeen.get(key);
    if (!previous || (date && date < previous)) firstSeen.set(key, date);
  }

  const out = new Map();
  for (const [setCode, byExpansion] of counts.entries()) {
    const candidates = [...byExpansion.entries()].map(([idExpansion, count]) => ({
      idExpansion,
      count,
      firstSeen: firstSeen.get(setCode + "|" + idExpansion) || ""
    }));
    candidates.sort((a,b) => b.count - a.count || String(a.firstSeen).localeCompare(String(b.firstSeen)) || a.idExpansion - b.idExpansion);
    if (candidates[0]) out.set(setCode, candidates[0].idExpansion);
  }
  return out;
}

async function main() {
  const [remoteCardsRaw, remotePacksRaw, op17Raw, productsRaw, pricesRaw, previous] = await Promise.all([
    fetchJson(REMOTE_CARDS_URL),
    fetchJson(REMOTE_PACKS_URL),
    fetchJson(REMOTE_OP17_URL),
    fetchJson(PRODUCT_URL),
    fetchJson(PRICE_URL),
    readPreviousDataset()
  ]);

  const packs = Array.isArray(remotePacksRaw) ? remotePacksRaw : Object.values(remotePacksRaw || {});
  const dynamicSetNames = new Map(
    packs.map(p => [String(p?.code || "").trim().toUpperCase(), String(p?.name || "").trim()])
  );
  let cards = normalizeCardCatalog(remoteCardsRaw).map(card => ({
    ...card,
    set_name: String(card.set_name || dynamicSetNames.get(card.set) || "")
  }));
  const o17 = op17Raw?.data?.cards || [];
  const normalized17 = o17.map(card => ({...card, set:"OP-17"}));
  const ids = new Set(normalized17.map(card => card.id));
  cards = cards.filter(card => !ids.has(card.id)).concat(normalized17).filter(card => !isJapaneseCard(card));
  const allProducts = readProducts(productsRaw);
  const japaneseExpansionIds = collectJapaneseExpansionIds(allProducts);
  const products = allProducts.filter(product => isEnglishProduct(product, japaneseExpansionIds));
  const productVersions = buildProductVersionIndex(products);
  const prices = priceGuideIndex(readPrices(pricesRaw));
  if (!cards.length) throw new Error("Local card catalog is empty");
  if (!products.length) throw new Error("Cardmarket product catalog is empty");
  if (!prices.size) throw new Error("Cardmarket price guide is empty");
  const primaryExpansionBySet = primaryExpansionMap(products);
  const oldCards = previous?.cards || {};
  const outputCards = {};
  const unmatched = [];
  let priced = 0;
  let mapped = 0;

  for (const card of cards) {
    const exactCandidates = allProductsForCard(card, products, primaryExpansionBySet, japaneseExpansionIds);
    const productPool = exactCandidates.length ? exactCandidates : products;
    const product = chooseProduct(card, productPool, primaryExpansionBySet, productVersions);
    if (!product) {
      unmatched.push(card.id);
      const prior = oldCards[card.id] || {};
      if (/_p\d+$/i.test(String(card.id))) {
      console.log(JSON.stringify({
        debugCard: card.id,
        set: card.set,
        debugName: card.name,
        chosen: product && {
          idProduct: product.idProduct,
          name: product.name,
          expansionName: product.expansionName,
          idExpansion: product.idExpansion,
          idMetacard: product.idMetacard,
          number: product.number,
          dateAdded: product.dateAdded
        }
      }));
    }

    outputCards[card.id] = {
        eur: null,
        trend: null,
        low: null,
        avg: null,
        avg1: null,
        avg7: null,
        avg30: null,
        cardmarketId: null,
        expansionId: null,
        expansion: String(CARDMARKET_SET_NAMES[sourceSetCode(card)]?.[0] || card.set_name || sourceSetCode(card)),
        version: localVersion(card.id),
        url: cardmarketCardUrl(card),
        launchPrice: priceNumber(prior.launchPrice),
        launchPriceDate: prior.launchPriceDate || null,
        source: "Cardmarket public product catalog; fallback to card page when no exact product is published",
        sourceUrl: "https://www.cardmarket.com/es/OnePiece/Data"
      };
      continue;
    }

    const guide = prices.get(String(product.idProduct));
    const eur = guide ? priceNumber(
      guide.trend,
      guide.TREND,
      guide["Trend Price"],
      guide.avg,
      guide.AVG,
      guide.sell,
      guide.SELL
    ) : null;

    mapped++;
    if (eur !== null) priced++;
    const prior = oldCards[card.id] || {};
    const launchPrice = priceNumber(prior.launchPrice) ?? eur;
    const launchPriceDate = prior.launchPriceDate || (launchPrice !== null ? pricesRaw?.createdAt || new Date().toISOString() : null);

    outputCards[card.id] = {
      eur,
      trend: guide ? priceNumber(guide.trend, guide.TREND, guide["Trend Price"]) : null,
      low: guide ? priceNumber(guide.low, guide.LOW, guide["Low Price"]) : null,
      avg: guide ? priceNumber(guide.avg, guide.AVG, guide["Avg. Sell Price"]) : null,
      avg1: guide ? priceNumber(guide.avg1, guide.AVG1, guide["AVG1"]) : null,
      avg7: guide ? priceNumber(guide.avg7, guide.AVG7, guide["AVG7"]) : null,
      avg30: guide ? priceNumber(guide.avg30, guide.AVG30, guide["AVG30"]) : null,
      cardmarketId: Number(product.idProduct),
      expansionId: Number(product.idExpansion),
      expansion: String(product.expansionName || CARDMARKET_SET_NAMES[sourceSetCode(card)]?.[0] || sourceSetCode(card)),
      version: localVersion(card.id),
      url: "https://www.cardmarket.com/es/OnePiece/Products?idProduct=" + encodeURIComponent(String(product.idProduct)),
      launchPrice,
      launchPriceDate,
      source: "Cardmarket public English product catalog + daily price guide",
      sourceUrl: "https://www.cardmarket.com/es/OnePiece/Data"
    };
  }

  const coverage = mapped / Math.max(1, cards.length);

  const createdAt = pricesRaw?.createdAt || new Date().toISOString();
  const payload = {
    schemaVersion: 7,
    updatedAt: createdAt,
    source: "Cardmarket public English One Piece product catalog + daily price guide",
    sourcePage: "https://www.cardmarket.com/es/OnePiece/Data",
    launchPricePolicy: previous?.launchPricePolicy || "Precio de salida = primera cotización diaria registrada por MiAlbumOnePiece para esa impresión.",
    cards: outputCards,
    stats: {
      catalogCards: cards.length,
      productCatalogSingles: products.length,
      priceGuideRows: prices.size,
      mappedCards: mapped,
      pricedCards: priced,
      priceCards: Object.keys(outputCards).length,
      coverage: Number(coverage.toFixed(4)),
      priceCoverage: Number((priced / Math.max(1, cards.length)).toFixed(4)),
      englishOnly: true,
      unmatched: unmatched.length
    }
  };

  if (coverage < MIN_COVERAGE) {
    throw new Error("Safety check failed: only " + mapped + "/" + cards.length + " cards matched to an exact Cardmarket product (" + (coverage * 100).toFixed(1) + "%)");
  }

  const previousUpdated = String(previous?.updatedAt || "");
  const changed = JSON.stringify(previous?.cards || {}) !== JSON.stringify(outputCards) || previousUpdated !== String(createdAt);
  if (!changed && previous) {
    console.log(JSON.stringify({...payload.stats, changed:false}));
    return;
  }

  await fs.writeFile(
    new URL("../data/cardmarket-prices.json", import.meta.url),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );

  console.log(JSON.stringify({
    ...payload.stats,
    changed:true,
    launchPricePolicy: payload.launchPricePolicy,
    sample: Object.entries(outputCards).slice(0,3).map(([id, value]) => ({
      id,
      cardmarketId:value.cardmarketId,
      expansion:value.expansion,
      eur:value.eur,
      launchPrice:value.launchPrice
    }))
  }));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
