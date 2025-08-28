// scripts/pbw_agent.mjs
// Bruker innebygd fetch (Node 18+) + cheerio for scraping

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Konfig ===
const DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();
const AFFIL_TAG = (process.env.AFFIL_TAG || "").trim();

// Kategorier vi følger (Amazon US)
const categories = {
  electronics: "https://www.amazon.com/gp/bestsellers/electronics",
  home_garden: "https://www.amazon.com/gp/bestsellers/home-garden",
  beauty: "https://www.amazon.com/gp/bestsellers/beauty",
};

const DATA_FILE = path.join(__dirname, "../data/top_sellers.json");

// --- Hjelpefunksjoner ---
async function scrapeCategory(name, url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const items = [];

    $("div.zg-grid-general-faceout").slice(0, 5).each((i, el) => {
      const title = $(el).find("div.p13n-sc-truncate").text().trim();
      const link = $(el).find("a.a-link-normal").attr("href");
      const fullLink = link
        ? `https://www.amazon.com${link}?tag=${AFFIL_TAG}`
        : null;

      if (title && fullLink) {
        items.push({ rank: i + 1, title, url: fullLink });
      }
    });

    return items;
  } catch (err) {
    console.error(`[${name}] scrape error:`, err.message);
    return { error: err.message };
  }
}

async function sendDiscord(msg) {
  if (!DISCORD_WEBHOOK) {
    console.log("No Discord webhook set.");
    return;
  }
  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: msg }),
  });
}

// --- Hovedløp ---
async function run() {
  const results = {};
  for (const [name, url] of Object.entries(categories)) {
    results[name] = await scrapeCategory(name, url);
  }

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(results, null, 2));

  let report = "📊 PBW Agent: oppdatert toppselgere\n";
  for (const [cat, items] of Object.entries(results)) {
    if (Array.isArray(items)) {
      report += `• ${cat}: ${items.length} varer ✅\n`;
    } else {
      report += `• ${cat}: 0 (error: ${items.error}) ❌\n`;
    }
  }

  await sendDiscord(report);
  console.log(report);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});