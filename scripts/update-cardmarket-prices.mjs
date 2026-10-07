import fs from "node:fs/promises";

const PRODUCT_URL = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const PRICE_URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json";
const REQUEST_TIMEOUT = 120000;
const MIN_COVERAGE = 0.90;
const REMOTE_ALLSETS_URL = "https://raw.githubusercontent.com/hugoprudente/optcgjson/main/output/AllSets.json";
const OPASSETS_HISTORY_DIR_URL = "https://api.github.com/repos/ryscode/OPASSETS/contents/CM-Data/Final/PriceHistory?ref=main";
const EXACT_PRINTMAP_URL = "https://raw.githubusercontent.com/michalkiral/optcg-data/main/data/prices/printmap.json";
const EXACT_PRINT_PRICES_URL = "https://raw.githubusercontent.com/michalkiral/optcg-data/main/data/prices/summary.json";

const CARDMARKET_SET_NAMES = {
  "P": ["Promos", "Special Tournaments Promos", "Premium Bandai Products"],
  "OP-01": ["Romance Dawn"],
  "OP-02": ["Paramount War"],
  "OP-03": ["Pillars of Strength"],
  "OP-04": ["Kingdoms of Intrigue"],
  "OP-05": ["Awakening of the New Era"],
  "OP-06": ["Wings of the Captain"],
  "OP-07": ["500 Years into the Future", "500 Years in the Future"],
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
  "OP-17": ["The World's Strongest Warriors", "The World’s Strongest Warriors"],
  "OP-18": ["The Dominance of God"],
  "EB-01": ["Memorial Collection"],
  "EB-02": ["Anime 25th Collection"],
  "EB-03": ["Heroines Edition", "One Piece Heroines Edition"],
  "EB-04": ["The Azure Sea's Seven", "The Azure Sea’s Seven"],
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
  "ST-11": ["Starter Deck: Uta", "Starter Deck Uta"],
  "ST-12": ["Starter Deck: Zoro & Sanji", "Starter Deck Zoro and Sanji"],
  "ST-13": ["Starter Deck The Three Brothers"],
  "ST-14": ["Starter Deck 3D2Y"],
  "ST-15": ["Starter Deck: Edward.Newgate", "Starter Deck Red Edward Newgate"],
  "ST-16": ["Starter Deck: Green Uta", "Starter Deck Green Uta"],
  "ST-17": ["Starter Deck: Donquixote Doflamingo", "Starter Deck Blue Donquixote Doflamingo"],
  "ST-18": ["Starter Deck: Purple Monkey.D.Luffy", "Starter Deck Purple Monkey D Luffy"],
  "ST-19": ["Starter Deck: Smoker", "Starter Deck Black Smoker"],
  "ST-20": ["Starter Deck: Charlotte Katakuri", "Starter Deck Yellow Charlotte Katakuri"],
  "ST-21": ["Starter Deck: EX Gear 5", "Starter Deck GEAR5"],
  "ST-22": ["Starter Deck: EX Ace & Newgate", "Starter Deck Ace & Newgate"],
  "ST-23": ["Starter Deck RED Shanks"],
  "ST-24": ["Starter Deck GREEN Jewelry Bonney"],
  "ST-25": ["Starter Deck BLUE Buggy"],
  "ST-26": ["Starter Deck PURPLE BLACK Monkey D Luffy"],
  "ST-27": ["Starter Deck BLACK Marshall D Teach"],
  "ST-28": ["Starter Deck GREEN YELLOW Yamato"],
  "ST-29": ["Starter Deck Egghead"],
  "ST-30": ["Starter Deck: EX Luffy & Ace", "Starter Deck Luffy & Ace"],
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

function isEnglishProduct(product = null, japaneseExpansionIds = null) {
  if (isJapaneseExpansion(product?.expansionName) || isJapaneseExpansion(product?.name)) return false;
  if (japaneseExpansionIds?.has(Number(product?.idExpansion))) return false;
  return true;
}

async function loadCardmarketExpansionLanguageMap() {
  try {
    const dirs = await fetchJson(OPASSETS_HISTORY_DIR_URL);
    const dates = (Array.isArray(dirs) ? dirs : [])
      .map(x => String(x?.name || ""))
      .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x))
      .sort();
    const latest = dates.at(-1);
    if (!latest) throw new Error("No OPASSETS price-history date found");

    const indexUrl = "https://raw.githubusercontent.com/ryscode/OPASSETS/main/CM-Data/Final/PriceHistory/" + latest + "/index.json";
    const index = await fetchJson(indexUrl);
    const entries = Array.isArray(index?.files) ? index.files : [];

    const grouped = new Map();
    const japaneseIds = new Set();
    const expansionNamesById = new Map();
    const englishExpansionIdsBySet = new Map();

    for (const entry of entries) {
      const id = Number(entry?.expansionId);
      if (!Number.isFinite(id)) continue;
      const expansionName = String(entry?.expansionName || "").trim();
      if (expansionName) expansionNamesById.set(id, expansionName);
      if (isJapaneseExpansion(expansionName) || isJapaneseExpansion(entry?.file)) japaneseIds.add(id);

      const normalized = norm(expansionName);
      if (normalized) {
        if (!grouped.has(normalized)) grouped.set(normalized, []);
        grouped.get(normalized).push(entry);
      }
    }

    // Some Japanese expansions have the same bare expansion name as their
    // English twin. Inspect only those duplicate expansion files; their
    // productName fields include Cardmarket's explicit "(Non-English)",
    // "(Japanese)" or "(Asia Region Legal)" marker.
    const ambiguous = [...grouped.values()].filter(group => group.length > 1);
    const detailResults = await Promise.all(ambiguous.flatMap(group =>
      group.map(async entry => {
        try {
          const url = "https://raw.githubusercontent.com/ryscode/OPASSETS/main/CM-Data/Final/PriceHistory/" + latest + "/" + entry.file;
          const detail = await fetchJson(url);
          const rows = Array.isArray(detail?.priceGuides) ? detail.priceGuides : [];
          const markedJapanese = rows.some(row =>
            isJapaneseExpansion(row?.productName) || isJapaneseExpansion(row?.productCategoryName)
          );
          return {id:Number(entry.expansionId), markedJapanese};
        } catch {
          return {id:Number(entry.expansionId), markedJapanese:false};
        }
      })
    ));
    for (const row of detailResults) {
      if (row.markedJapanese) japaneseIds.add(row.id);
    }

    for (const entry of entries) {
      const id = Number(entry?.expansionId);
      if (!Number.isFinite(id) || japaneseIds.has(id)) continue;
      for (const setCode of Object.keys(CARDMARKET_SET_NAMES)) {
        if (expansionMatches(setCode, entry?.expansionName)) {
          if (!englishExpansionIdsBySet.has(setCode)) englishExpansionIdsBySet.set(setCode, new Set());
          englishExpansionIdsBySet.get(setCode).add(id);
        }
      }
    }

    return {latest, japaneseExpansionIds:japaneseIds, expansionNamesById, englishExpansionIdsBySet};
  } catch (error) {
    console.warn("Cardmarket expansion-language map unavailable:", error?.message || error);
    return {latest:null, japaneseExpansionIds:new Set(), expansionNamesById:new Map(), englishExpansionIdsBySet:new Map()};
  }
}

function sourceSetCode(card) {
  const cardBase = baseId(card?.id);
  if (/^P-\d{3}$/i.test(cardBase)) return "P";
  const rawSet = String(card?.source_set || card?.set || "").trim().toUpperCase();
  // Some One Piece datasets encode EB-04/EB-05 cards as OP14-EB04 / OP15-EB04.
  // Preserve that source-set identity instead of deriving it from the printed
  // card number prefix (OP14 / OP15).
  if (/^OP\d{2}-EB\d{2}$/i.test(rawSet)) return rawSet;
  if (/^(EB|OP|ST|PRB)-?\d{2}$/i.test(rawSet)) {
    const m = rawSet.match(/^(EB|OP|ST|PRB)-?(\d{2})$/i);
    return m[1].toUpperCase() + "-" + m[2];
  }
  const code = extractCardCode(baseId(card?.id));
  if (!code) return rawSet;
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
  const m = String(text || "").toUpperCase().match(/\b((?:OP|EB|ST|PRB)\d{2}|P)[- ](\d{3})\b/);
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

function externalExpansionSlug(url) {
  const match = String(url || "").match(/\/Products\/Singles\/([^/]+)\//i);
  return match ? norm(match[1].replace(/-/g, " ")) : "";
}

function externalPrintHints(card, exactPrintOracle) {
  return exactPrintOracle?.urlsByPrint?.get(String(card?.id || "")) || [];
}

function externalExpansionScore(card, product, expansionNamesById, exactPrintOracle) {
  const hints = externalPrintHints(card, exactPrintOracle);
  if (!hints.length) return 0;

  const productExpansion = norm(
    expansionNamesById?.get(Number(product?.idExpansion)) ||
    product?.expansionName ||
    ""
  );
  if (!productExpansion) return 0;

  let best = 0;
  for (const url of hints) {
    const urlExpansion = externalExpansionSlug(url);
    if (!urlExpansion || /japanese|non english|asia region/.test(urlExpansion)) continue;
    if (urlExpansion === productExpansion) best = Math.max(best, 150);
    else if (urlExpansion.includes(productExpansion) || productExpansion.includes(urlExpansion)) best = Math.max(best, 80);
  }
  return best;
}

function externalPriceScore(card, product, guide, exactPrintOracle) {
  const target = Number(exactPrintOracle?.priceByPrint?.get(String(card?.id || "")));
  if (!(target > 0) || !guide) return 0;

  const values = [guide.trend, guide.avg, guide.avg7, guide.avg30, guide.low]
    .map(Number)
    .filter(value => value > 0);
  if (!values.length) return 0;

  const distance = Math.min(...values.map(value => Math.abs(Math.log(target / value))));
  if (!Number.isFinite(distance)) return 0;
  return Math.max(-100, 120 - distance * 70);
}

async function loadExactPrintOracle() {
  try {
    const [printmap, summary] = await Promise.all([
      fetchJson(EXACT_PRINTMAP_URL),
      fetchJson(EXACT_PRINT_PRICES_URL)
    ]);

    const urlsByPrint = new Map();
    for (const [url, id] of Object.entries(printmap?.map || {})) {
      const key = String(id || "").trim();
      if (!key || !url) continue;
      if (!urlsByPrint.has(key)) urlsByPrint.set(key, []);
      urlsByPrint.get(key).push(String(url));
    }

    const priceByPrint = new Map();
    for (const [id, value] of Object.entries(summary?.cards || {})) {
      const eur = Number(value?.eur);
      if (Number.isFinite(eur) && eur > 0) priceByPrint.set(String(id), eur);
    }

    return {urlsByPrint, priceByPrint};
  } catch (error) {
    console.warn("Exact print oracle unavailable:", error?.message || error);
    return {urlsByPrint:new Map(), priceByPrint:new Map()};
  }
}

function candidateScore(card, product, productVersions, primaryExpansionBySet, expansionNamesById, exactPrintOracle, prices) {
  const cardBase = baseId(card.id).toUpperCase();
  const code = extractCardCode(product?.name);
  const cardCode = extractCardCode(cardBase);
  if (code && cardCode && code !== cardCode) return -1000;

  let score = 0;
  if (code && cardCode && code === cardCode) score += 40;

  const pNumber = String(product?.number ?? "").trim().replace(/^0+/, "") || "0";
  const cNumber = numberPart(cardBase).replace(/^0+/, "") || "0";
  if (pNumber === cNumber) score += 20;

  const sourceSet = sourceSetCode(card);
  const expectedExpansions = [...(CARDMARKET_SET_NAMES[sourceSet] || []), card?.set_name]
    .map(norm)
    .filter(Boolean);
  const productExpansion = norm(
    expansionNamesById?.get(Number(product?.idExpansion)) ||
    product?.expansionName ||
    ""
  );
  if (expectedExpansions.includes(productExpansion)) score += 100;
  else if (/(^|\s)(promo|promos)(\s|:|-|$)/i.test(productExpansion)) score -= 80;

  const primaryExpansionId = primaryExpansionBySet?.get(sourceSet);
  if (primaryExpansionId && Number(product.idExpansion) === Number(primaryExpansionId)) score += 10;
  if (cardNameMatches(card, product)) score += cardNameMatches(card, product);

  // Cardmarket does not expose reliable V1/V2 ordering in its public product
  // catalog, so inferred dateAdded versions must never override print matching.
  const explicitVersion = productVersion(product?.name);
  const wantedVersion = localVersion(card.id);
  if (explicitVersion !== null) {
    if (wantedVersion === explicitVersion) score += 25;
    else score -= 15;
  }

  const guide = prices?.get(String(product?.idProduct));
  score += externalExpansionScore(card, product, expansionNamesById, exactPrintOracle);
  score += externalPriceScore(card, product, guide, exactPrintOracle);

  return score;
}

function chooseProduct(
  card,
  productsBySetAndNumber,
  primaryExpansionBySet,
  productVersions,
  desiredVersion = localVersion(card.id),
  expansionNamesById = null,
  exactPrintOracle = null,
  prices = null
) {
  const base = baseId(card.id).toUpperCase();
  const cardCode = extractCardCode(base);
  const number = numberPart(base);

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

    const score = candidateScore(
      card,
      product,
      productVersions,
      primaryExpansionBySet,
      expansionNamesById,
      exactPrintOracle,
      prices
    );

    if (score > 0) pool.push({product, score});
  }

  pool.sort((a, b) =>
    b.score - a.score ||
    Number(a.product.idProduct) - Number(b.product.idProduct)
  );

  return pool[0]?.product || null;
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

function allCardmarketProductsForCard(card, products) {
  const matches = [];
  const base = baseId(card.id).toUpperCase();
  const code = extractCardCode(base);
  const number = numberPart(base);
  for (const product of products) {
    if (!product?.idProduct || !isEnglishProduct(product)) continue;
    const pCode = extractCardCode(product.name);
    if (pCode && code) {
      if (pCode !== code) continue;
    } else {
      if (!number) continue;
      const pNumber = String(product.number ?? "").trim().replace(/^0+/, "");
      if (pNumber !== number.replace(/^0+/, "")) continue;
    }
    matches.push(product);
  }
  return matches;
}

function allProductsForCard(card, products, englishExpansionIdsBySet) {
  const matches = [];
  const base = baseId(card.id).toUpperCase();
  const code = extractCardCode(base);
  const number = numberPart(base);
  const sourceSet = sourceSetCode(card);
  const preferredExpansionIds = englishExpansionIdsBySet?.get(sourceSet) || null;

  for (const product of products) {
    if (!product?.idProduct || !isEnglishProduct(product)) continue;
    const pCode = extractCardCode(product.name);
    if (pCode && code) {
      if (pCode !== code) continue;
    } else {
      if (!number) continue;
      const pNumber = String(product.number ?? "").trim().replace(/^0+/, "");
      if (pNumber !== number.replace(/^0+/, "")) continue;
    }

    const expansionId = Number(product.idExpansion);
    const matchesConfiguredExpansion = preferredExpansionIds?.has(expansionId) || false;
    if (sourceSet === "P") {
      matches.push(product);
      continue;
    }

    const matchesExpansionName = expansionMatches(sourceSet, product?.expansionName, card?.set_name);
    if (matchesConfiguredExpansion || matchesExpansionName) matches.push(product);
  }

  return matches;
}

function normalizeOptcgSetCode(raw) {
  const value = String(raw || "").trim().toUpperCase();
  if (value === "OP14") return "OP14-EB04";
  if (value === "OP15") return "OP15-EB04";
  const m = value.match(/^(OP|EB|ST|PRB)-?(\d{2})$/i);
  return m ? m[1].toUpperCase() + "-" + m[2] : value;
}

function normalizeOptcgCatalog(parsed) {
  const root = parsed?.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? parsed.data : (parsed || {});
  const entries = Object.entries(root);
  const cards = [];
  const packs = [];
  const seen = new Set();
  for (const [key, payload] of entries) {
    const data = payload?.data || payload;
    if (!data || !Array.isArray(data.cards)) continue;
    const setCode = normalizeOptcgSetCode(data.code || key);
    const setName = String(data.name || "").trim();
    const setCards = Array.isArray(data.cards) ? data.cards : [];
    packs.push({code: setCode, name: setName, cardCount: setCards.length});
    for (const raw of setCards) {
      const id = String(raw?.id || "").trim();
      if (!id || seen.has(id)) continue;
      if (Array.isArray(raw?.languages) && raw.languages.length && !raw.languages.some(x => /^English$/i.test(String(x)))) continue;
      seen.add(id);
      const idPrefix = id.toUpperCase().match(/^(OP|EB|ST|PRB)(\d{2})-/i);
      const cardSet = idPrefix ? normalizeOptcgSetCode(idPrefix[1] + idPrefix[2]) : setCode;
      cards.push({
        id, set: cardSet, source_set: setCode, set_name: setName, name: String(raw?.name || "").trim(),
        rarity: raw?.rarity === "L" ? "Leader" : String(raw?.rarity || "").trim(),
        category: raw?.cardClass === "LEADER" ? "Leader" : raw?.cardClass === "EVENT" ? "Event" : raw?.cardClass === "STAGE" ? "Stage" : raw?.cardClass === "DON" ? "Don" : "Character",
        colors: Array.isArray(raw?.color) ? raw.color : [], cost: raw?.cost == null ? null : Number(raw.cost),
        power: raw?.power == null ? null : Number(raw.power), counter: raw?.counter == null ? null : Number(raw.counter),
        block: raw?.blockIcon == null ? null : Number(raw.blockIcon) || raw.blockIcon,
        attributes: Array.isArray(raw?.attribute) ? raw.attribute : [], types: Array.isArray(raw?.feature) ? raw.feature : [],
        effect: raw?.effect || "", trigger: raw?.trigger || null, image: raw?.imageUrl || "", isParallel: !!raw?.isParallel
      });
    }
  }
  return {cards, packs};
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
  const [remoteAllSetsRaw, productsRaw, pricesRaw, previous, languageMap, exactPrintOracle] = await Promise.all([
    fetchJson(REMOTE_ALLSETS_URL),
    fetchJson(PRODUCT_URL),
    fetchJson(PRICE_URL),
    readPreviousDataset(),
    loadCardmarketExpansionLanguageMap(),
    loadExactPrintOracle()
  ]);
  const catalog = normalizeOptcgCatalog(remoteAllSetsRaw);
  const packs = catalog.packs;
  const dynamicSetNames = new Map(packs.map(p => [String(p?.code || "").trim().toUpperCase(), String(p?.name || "").trim()]));
  const cards = catalog.cards.map(card => ({
    ...card, set_name: String(card.set_name || dynamicSetNames.get(card.set) || "")
  })).filter(card => !isJapaneseCard(card));

  const allProducts = readProducts(productsRaw);
  const products = allProducts.filter(product => isEnglishProduct(product, languageMap.japaneseExpansionIds));
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

  const cardByBaseId = new Map();
  for (const candidate of cards) {
    const key = baseId(candidate.id).toUpperCase();
    const exactBase = candidate.id.toUpperCase() === key;
    const existing = cardByBaseId.get(key);
    const existingIsExactBase = existing ? existing.id.toUpperCase() === key : false;
    if (!existing || (exactBase && !existingIsExactBase)) cardByBaseId.set(key, candidate);
  }
  for (const card of cards) {
    const isParallelVariant = Boolean(card.isParallel) || /_p\d+$/i.test(String(card.id));
    const baseCard = cardByBaseId.get(baseId(card.id).toUpperCase()) || card;
    const exactCandidates = allProductsForCard(card, products, languageMap.englishExpansionIdsBySet);
    // Never fall back to the whole Cardmarket catalog here: a matching
    // card number can exist in several expansions/reprints. The primary
    // product must belong to this card's own expansion.
    const productPool = exactCandidates;
    const desiredMarketVersion = localVersion(card.id);
    const product = chooseProduct(
      card,
      productPool,
      primaryExpansionBySet,
      productVersions,
      desiredMarketVersion,
      languageMap.expansionNamesById,
      exactPrintOracle,
      prices
    );
    if (!product) {
      unmatched.push(card.id);
      const prior = oldCards[card.id] || {};

    const oraclePrice = Number(exactPrintOracle?.priceByPrint?.get(String(card.id)));
    const oracleUrls = exactPrintOracle?.urlsByPrint?.get(String(card.id)) || [];
    const oracleUrl = oracleUrls[0] || null;
    outputCards[card.id] = {
        eur: Number.isFinite(oraclePrice) && oraclePrice > 0 ? oraclePrice : null,
        trend: null,
        low: null,
        avg: null,
        avg1: null,
        avg7: null,
        avg30: null,
        cardmarketId: null,
        expansionId: null,
        expansion: String(CARDMARKET_SET_NAMES[sourceSetCode(card)]?.[0] || card.set_name || sourceSetCode(card)),
        version: desiredMarketVersion,
        url: oracleUrl ? oracleUrl.replace("/en/OnePiece/", "/es/OnePiece/") : cardmarketCardUrl(baseCard),
        variantOf: isParallelVariant && baseCard.id !== card.id ? baseCard.id : null,
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

    const collectionProducts = allCardmarketProductsForCard(baseCard, products)
      .sort((a,b) =>
        String(a?.expansionName||"").localeCompare(String(b?.expansionName||""),"en",{numeric:true}) ||
        String(a?.dateAdded||"").localeCompare(String(b?.dateAdded||"")) ||
        Number(a?.idProduct||0)-Number(b?.idProduct||0)
      );
    const collections = collectionProducts.map(collectionProduct => {
      const collectionGuide = prices.get(String(collectionProduct.idProduct));
      const collectionEur = collectionGuide ? priceNumber(
        collectionGuide.trend,
        collectionGuide.TREND,
        collectionGuide["Trend Price"],
        collectionGuide.avg,
        collectionGuide.AVG,
        collectionGuide.sell,
        collectionGuide.SELL
      ) : null;
      return {
        expansion: String(collectionProduct.expansionName || languageMap.expansionNamesById?.get(Number(collectionProduct.idExpansion)) || "").trim(),
        expansionId: Number(collectionProduct.idExpansion),
        cardmarketId: Number(collectionProduct.idProduct),
        version: productVersions?.get(String(collectionProduct.idProduct)) ?? productVersion(collectionProduct.name) ?? 1,
        eur: collectionEur,
        url: "https://www.cardmarket.com/es/OnePiece/Products?idProduct=" + encodeURIComponent(String(collectionProduct.idProduct))
      };
    });

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
      expansion: String(languageMap.expansionNamesById?.get(Number(product.idExpansion)) || CARDMARKET_SET_NAMES[sourceSetCode(card)]?.[0] || sourceSetCode(card)),
      version: productVersions?.get(String(product.idProduct)) ?? productVersion(product.name) ?? desiredMarketVersion,
      url: (exactPrintOracle?.urlsByPrint?.get(String(card.id))?.[0]
        ? exactPrintOracle.urlsByPrint.get(String(card.id))[0].replace("/en/OnePiece/", "/es/OnePiece/")
        : "https://www.cardmarket.com/es/OnePiece/Products?idProduct=" + encodeURIComponent(String(product.idProduct))),
      collections,
      launchPrice,
      launchPriceDate,
      variantOf: isParallelVariant && baseCard.id !== card.id ? baseCard.id : null,
      source: "Cardmarket public English product catalog + daily price guide",
      sourceUrl: "https://www.cardmarket.com/es/OnePiece/Data"
    };
  }

  const coverage = mapped / Math.max(1, cards.length);

  const createdAt = pricesRaw?.createdAt || new Date().toISOString();
  const payload = {
    schemaVersion: 8,
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
