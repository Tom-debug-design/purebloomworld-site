// config.mjs
// Sentral konfig for PBW-agenten

// Secrets fra GitHub Actions (Settings → Secrets and variables → Actions)
export const DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();
export const AFFIL_TAG       = (process.env.AFFIL_TAG || "").trim(); // valgfri

// Hvor ligger den kurerte ASIN-lista?
// (pbw_agent.mjs vil resolve denne relativt til repo-roten)
export const ASIN_LIST_FILE  = "config/asin_lists.json";

// Hvilken rekkefølge/ hvilke kategorier vil vi vise i Discord-rapporten (valgfritt)
export const CATEGORY_ORDER = [
  "electronics",
  "home_garden",
  "beauty",
  "fashion",
  "sports",
  "health",
  "toys",
  "appliances",
  "outdoors",
  "pets",
  "baby",
  "office",
  "automotive",
  "kitchen",
  "video_games"
];