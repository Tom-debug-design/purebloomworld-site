// config.mjs
// === Konfigurasjon for PBW Agent (stabil, uten scraping) ===

// Hentes fra GitHub Secrets
export const DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();
export const AFFIL_TAG = (process.env.AFFIL_TAG || "").trim();

// Fil med kuraterte ASIN-er (ligger i /config)
export const ASIN_LIST_FILE = "config/asin_lists.json";

// Rekkefølge på kategorier i output
export const CATEGORY_ORDER = [
  "electronics",
  "home_garden",
  "beauty",
  // legg til flere nøkler hvis du utvider asin_lists.json
];