// config.mjs
// === Konfigurasjon for PBW Agent ===

// Discord webhook (hentes fra GitHub Secrets → DISCORD_WEBHOOK)
export const DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();

// Affiliate-tag (fra GitHub Secrets → AFFIL_TAG, valgfri)
export const AFFIL_TAG = (process.env.AFFIL_TAG || "").trim();

// Kategorier vi følger (Amazon Best Sellers URLer)
export const SOURCES = [
  { key: "electronics", url: "https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics" },
  { key: "home_garden", url: "https://www.amazon.com/Best-Sellers-Home-Kitchen/zgbs/home-garden" },
  { key: "beauty", url: "https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty" }
];

// Antall produkter vi tar med per kategori
export const LIMIT = 20;

// Forsinkelse mellom requests (sekunder)
export const DELAY_SECONDS = 5;