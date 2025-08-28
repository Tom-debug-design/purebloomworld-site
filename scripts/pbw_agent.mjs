// scripts/pbw_agent.mjs
// Stabil agent: henter Best Sellers med forsinkelse + reader, parser ASIN via regex,
// og har "garantert fallback": bruker forrige data eller seed-liste hvis scraping gir for få treff.
// Ingen eksterne biblioteker (kun Node 18+ med global fetch).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCORD_WEBHOOK,
  AFFIL_TAG,
  ASIN_LIST_FILE,
  SOURCES,
  CATEGORY_ORDER,
  LIMIT,
  MIN_ACCEPT,
  TRY_READER_FIRST,
  MAX_RETRIES,
  RETRY_BASE_MS,
  DELAY_BETWEEN_CATEGORIES_MS,
} from "../config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Paths
const REPO_ROOT = path.join(__dirname, "..");
const ASIN_PATH = path.join(REPO_ROOT, ASIN_LIST_FILE);
const OUT_DIR   = path.join(REPO_ROOT, "data");
const OUT_FILE  = path.join(OUT_DIR, "top_sellers.json");

// --- Utils ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (ms) => Math.floor(ms * (0.85 + Math.random() * 0.3)); // ±15%

function asinToUrl(asin) {
  let url = `https://www.amazon.com/dp/${asin}`;
  if (AFFIL_TAG) url += `?tag=${encodeURIComponent(AFFIL_TAG)}`;
  return url;
}

async function postDiscord(content) {
  if (!DISCORD_WEBHOOK) {
    console.log("ℹ️  DISCORD_WEBHOOK ikke satt – skipper Discord-post.");
    return;
  }
  try {
    const res = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    console.log("Discord status:", res.status);
  } catch (e) {
    console.warn("Discord-post feilet (hopper videre):", e?.message || e);
  }
}

async function readJsonIfExists(p) {
  try { return JSON.parse(await fs.readFile(p, "utf-8")); }
  catch { return null; }
}

function orderKeys(obj, preferred) {
  if (!obj) return [];
  if (!Array.isArray(preferred) || preferred.length === 0) return Object.keys(obj);
  const want = new Set(preferred);
  const first = preferred.filter(k => k in obj);
  const rest  = Object.keys(obj).filter(k => !want.has(k));
  return [...first, ...rest];
}

// --- Scrape helpers (uten cheerio) ---
function extractAsinsFromHtml(html) {
  const re = /\/dp\/([A-Z0-9]{10})/g;
  const set = new Set();
  let m;
  while ((m = re.exec(html))) {
    set.add(m[1]);
    if (set.size >= LIMIT * 2) break; // samle litt ekstra før dedupe
  }
  return Array.from(set).slice(0, LIMIT);
}

function toReaderUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return rawUrl;
  }
}

async function httpGet(url) {
  let lastErr = null;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(jitter(RETRY_BASE_MS * (i + 1)));
    }
  }
  throw lastErr || new Error("fetch failed");
}

async function fetchCategoryHtml(src) {
  const urls = TRY_READER_FIRST
    ? [toReaderUrl(src.url), src.url]
    : [src.url, toReaderUrl(src.url)];
  let lastErr = null;
  for (const u of urls) {
    try {
      return await httpGet(u);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All attempts failed");
}

function buildItemsFromAsins(asins) {
  return asins.slice(0, LIMIT).map((asin, i) => ({
    rank: i + 1,
    asin,
    title: `ASIN ${asin}`,
    url: asinToUrl(asin),
  }));
}

// --- Main ---
async function main() {
  // 0) Last forrige data og seed-liste (for trygg fallback)
  const prev = await readJsonIfExists(OUT_FILE);
  const seeds = await readJsonIfExists(ASIN_PATH);

  const results = [];
  for (const src of SOURCES) {
    // Delay mellom kategorier (med litt jitter)
    await sleep(jitter(DELAY_BETWEEN_CATEGORIES_MS));

    let status = "fresh";
    let items = [];

    try {
      const html = await fetchCategoryHtml(src);
      const asins = extractAsinsFromHtml(html);
      if (asins.length >= MIN_ACCEPT) {
        items = buildItemsFromAsins(asins);
        status = "fresh";
      } else {
        // for få funn → bruk forrige data om tilgjengelig
        const prevItems = prev?.results?.find(r => r.key === src.key)?.items || [];
        if (prevItems.length >= MIN_ACCEPT) {
          items = prevItems.slice(0, LIMIT);
          status = "reuse_prev";
        } else {
          // sistelinje: seeds
          const seedAsins = Array.isArray(seeds?.[src.key]) ? seeds[src.key] : [];
          if (seedAsins.length) {
            items = buildItemsFromAsins(seedAsins);
            status = "seed";
          } else {
            items = []; // helt tomt – men vi feiler ikke jobben
            status = "empty";
          }
        }
      }
    } catch (e) {
      // Nettfeil → samme fallback som over
      const prevItems = prev?.results?.find(r => r.key === src.key)?.items || [];
      if (prevItems.length >= MIN_ACCEPT) {
        items = prevItems.slice(0, LIMIT);
        status = "reuse_prev";
      } else {
        const seedAsins = Array.isArray(seeds?.[src.key]) ? seeds[src.key] : [];
        if (seedAsins.length) {
          items = buildItemsFromAsins(seedAsins);
          status = "seed";
        } else {
          items = [];
          status = "empty";
        }
      }
    }

    results.push({ key: src.key, count: items.length, status, items });
  }

  // Ordne i ønsket rekkefølge
  const keyed = {};
  for (const r of results) keyed[r.key] = r;
  const ordered = orderKeys(keyed, CATEGORY_ORDER).map(k => keyed[k]);

  const data = {
    ts: new Date().toISOString(),
    source: "scrape+fallback",
    totals: ordered.reduce((n, r) => n + (r.items?.length || 0), 0),
    results: ordered,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✚ Wrote ${OUT_FILE} (totals=${data.totals})`);

  const lines = ordered
    .map(r => `• ${r.key}: ${r.count} (${r.status})`)
    .join("\n");
  await postDiscord([
    "PBW Agent: oppdatert toppselgere ✅",
    `totals: ${data.totals}`,
    lines,
    `at: ${data.ts}`,
  ].join("\n"));
}

main().catch(async (e) => {
  console.error("Fatal:", e);
  await postDiscord(`PBW Agent ❌ feilet: ${e.message}`);
  process.exit(1);
});