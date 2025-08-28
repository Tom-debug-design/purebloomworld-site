// scripts/pbw_agent.mjs
// ESM (Node 18+). Bruker innebygd fetch + cheerio for HTML-parsing.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Konfig ===
// Settes enkelt pr kategori senere. Default peker vi til Amazon Best Sellers (US).
// Vil du bruke andre land/kategorier, bytt URL-ene her.
const SOURCES = [
  { key: "electronics", url: "https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics" },
  { key: "home_garden", url: "https://www.amazon.com/Best-Sellers-Home-Kitchen/zgbs/home-garden" },
  { key: "beauty", url: "https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty" },
];

// Maks items per kategori:
const MAX_ITEMS = 20;

// Secrets / env
const DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();
const AFFIL_TAG = (process.env.AFFIL_TAG || "").trim();

// Hjelper: legg på affiliate-tag hvis tilgjengelig
function withTag(url) {
  if (!AFFIL_TAG || !url?.startsWith("https://")) return url;
  try {
    const u = new URL(url);
    // Amazon bruker ofte tag=...
    if (!u.searchParams.get("tag")) u.searchParams.set("tag", AFFIL_TAG);
    return u.toString();
  } catch {
    return url;
  }
}

// Parse funksjon – robust mot endringer (best effort)
function parseAmazon(html) {
  const $ = cheerio.load(html);
  const items = [];

  // Amazon endrer markup ofte – vi leter bredt etter produkt-kort lenker + titler.
  // Prøv vanlige selektorer fra "Best Sellers" (kan justeres ved behov):
  $("a.a-link-normal, a.a-link-normal[href*='/dp/']").each((_, el) => {
    if (items.length >= MAX_ITEMS) return;
    const href = $(el).attr("href") || "";
    // Finn tittel i nærhet
    const title =
      $(el).attr("title") ||
      $(el).find("span").first().text().trim() ||
      $(el).text().trim();

    // Lag full URL til dp/… hvis relativ
    let url = href;
    if (url && url.startsWith("/")) url = `https://www.amazon.com${url}`;
    if (!url.includes("/dp/")) return; // kun produktlenker

    if (title) {
      items.push({
        title,
        url: withTag(url),
      });
    }
  });

  // Dedup & trim
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.url.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

async function fetchCategory({ key, url }) {
  try {
    const res = await fetch(url, {
      headers: {
        // Litt snillere headers. (Vi går ikke aggressivt; kun best effort.)
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const items = parseAmazon(html);
    return { key, count: items.length, items };
  } catch (e) {
    return { key, error: String(e), items: [] };
  }
}

async function main() {
  const results = [];
  for (const src of SOURCES) {
    const r = await fetchCategory(src);
    results.push(r);
  }

  const data = {
    ts: new Date().toISOString(),
    totals: results.reduce((acc, r) => acc + (r.items?.length || 0), 0),
    results,
  };

  const outDir = path.join(__dirname, "..", "data");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "top_sellers.json");
  await fs.writeFile(outFile, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✚ Wrote ${outFile} with ${data.totals} items across ${results.length} categories.`);

  // Discord (valgfritt, soft-fail)
  if (DISCORD_WEBHOOK) {
    try {
      const lines = results
        .map((r) =>
          r.error
            ? `• ${r.key}: 0 (error: ${r.error})`
            : `• ${r.key}: ${r.items.length}`,
        )
        .join("\n");
      const msg = [
        `PBW Agent: oppdatert toppselgere ✅`,
        `totals: ${data.totals}`,
        lines,
        `at: ${data.ts}`,
      ].join("\n");

      const res = await fetch(DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg }),
      });
      console.log(`Discord status: ${res.status}`);
    } catch (e) {
      console.warn("Discord-post feilet (hopper videre):", e?.message || e);
    }
  } else {
    console.log("ℹ️ DISCORD_WEBHOOK ikke satt – skipper Discord-post.");
  }
}

await main();