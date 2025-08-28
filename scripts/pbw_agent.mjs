// scripts/pbw_agent.mjs
// Stabil agent: leser ASIN-er fra config/asin_lists.json,
// skriver data/top_sellers.json og poster status til Discord.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCORD_WEBHOOK,
  AFFIL_TAG,
  ASIN_LIST_FILE,
  CATEGORY_ORDER,
} from "../config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const REPO_ROOT = path.join(__dirname, "..");
const ASIN_PATH = path.join(REPO_ROOT, ASIN_LIST_FILE);
const OUT_DIR = path.join(REPO_ROOT, "data");
const OUT_FILE = path.join(OUT_DIR, "top_sellers.json");

// Helpers
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

function orderKeys(obj, preferred) {
  if (!Array.isArray(preferred) || preferred.length === 0) return Object.keys(obj);
  const want = new Set(preferred);
  const first = preferred.filter((k) => k in obj);
  const rest = Object.keys(obj).filter((k) => !want.has(k));
  return [...first, ...rest];
}

// Main
async function main() {
  // 1) Les curated ASIN-liste
  let lists;
  try {
    const raw = await fs.readFile(ASIN_PATH, "utf-8");
    lists = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Kan ikke lese ${ASIN_PATH}. Opprett/commit filen først. (${e.message})`);
  }

  // 2) Bygg struktur i ønsket rekkefølge
  const keys = orderKeys(lists, CATEGORY_ORDER);
  const results = keys.map((key) => {
    const asins = Array.isArray(lists[key]) ? lists[key] : [];
    const items = asins.map((asin, i) => ({
      rank: i + 1,
      asin,
      title: `ASIN ${asin}`,
      url: asinToUrl(asin),
    }));
    return { key, count: items.length, items };
  });

  const data = {
    ts: new Date().toISOString(),
    source: "curated-asin-list",
    totals: results.reduce((sum, r) => sum + r.items.length, 0),
    results,
  };

  // 3) Skriv datafil
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✚ Wrote ${OUT_FILE} with ${data.totals} items across ${results.length} categories.`);

  // 4) Discord-rapport
  const lines = results.map((r) => `• ${r.key}: ${r.items.length}`).join("\n");
  const msg = [
    "PBW Agent: oppdatert toppselgere ✅",
    `totals: ${data.totals}`,
    lines,
    `at: ${data.ts}`,
  ].join("\n");
  await postDiscord(msg);
}

main().catch(async (e) => {
  console.error("Fatal:", e);
  await postDiscord(`PBW Agent ❌ feilet: ${e.message}`);
  process.exit(1);
});