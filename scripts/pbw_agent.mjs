// scripts/pbw_agent.mjs
// PBW Agent – bruker konfig fra config.mjs
// Leser kategorier, bygger data/top_sellers.json og sender status til Discord

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCORD_WEBHOOK,
  AFFIL_TAG,
  SOURCES,
  LIMIT,
  DELAY_SECONDS,
} from "../config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.join(__dirname, "..", "data");
const OUT_FILE = path.join(OUT_DIR, "top_sellers.json");

// --- Helpers ---
function asinToUrl(asin) {
  let url = `https://www.amazon.com/dp/${asin}`;
  if (AFFIL_TAG) url += `?tag=${encodeURIComponent(AFFIL_TAG)}`;
  return url;
}

async function postDiscord(content) {
  if (!DISCORD_WEBHOOK) {
    console.log("ℹ️ DISCORD_WEBHOOK ikke satt – skipper Discord-post.");
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
    console.warn("Discord-post feilet:", e?.message || e);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Main ---
async function main() {
  const results = [];

  for (const src of SOURCES) {
    console.log(`Henter kategori: ${src.key} (${src.url})`);
    try {
      const res = await fetch(src.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      // Enkel fallback: vi bare lagrer URLene (mock)
      // TODO: bytte til PA-API når vi får tilgang
      const items = Array.from({ length: LIMIT }, (_, i) => ({
        rank: i + 1,
        asin: `MOCK-${src.key.toUpperCase()}-${i + 1}`,
        url: asinToUrl(`MOCK-${src.key.toUpperCase()}-${i + 1}`),
      }));

      results.push({ key: src.key, count: items.length, items });
    } catch (e) {
      console.error(`[${src.key}] feilet:`, e.message);
      results.push({ key: src.key, error: e.message, items: [] });
    }

    await sleep(DELAY_SECONDS * 1000);
  }

  const data = {
    ts: new Date().toISOString(),
    source: "pbw_agent",
    totals: results.reduce((n, r) => n + (r.items?.length || 0), 0),
    results,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✚ Skrev ${OUT_FILE} (${data.totals} varer)`);

  // Discord oppsummering
  const lines = results.map((r) => `• ${r.key}: ${r.count || 0}`).join("\n");
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