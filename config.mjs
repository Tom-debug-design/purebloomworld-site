// config.mjs
// === Konfigurasjon for PBW Agent (stabil autoutfylling) ===

// Secrets fra GitHub (Settings → Secrets and variables → Actions)
export const DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();
export const AFFIL_TAG       = (process.env.AFFIL_TAG || "").trim(); // valgfri

// Seed-liste (fallback) – filen brukes KUN når scraping feiler og ingen tidligere data finnes.
export const ASIN_LIST_FILE  = "config/asin_lists.json";

// Kategorier og kilder (Best Sellers). Du kan utvide listen senere.
// Vi holder oss til tre verifiserte innganger for robusthet.
export const SOURCES = [
  { key: "electronics",  url: "https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics" },
  { key: "home_garden",  url: "https://www.amazon.com/Best-Sellers-Home-Kitchen/zgbs/home-garden" },
  { key: "beauty",       url: "https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty" }
];

// Output-ordre i Discord/JSON
export const CATEGORY_ORDER = ["electronics", "home_garden", "beauty"];

// Hvor mange produkter per kategori
export const LIMIT = 10;

// Minst så mange funn må scraping gi før vi aksepterer ny liste; ellers beholder vi forrige.
export const MIN_ACCEPT = 5;

// Nettverksoppførsel
export const TRY_READER_FIRST = true;           // bruk "reader"-endepunkt før direkte kall
export const MAX_RETRIES = 2;                   // forsøk per URL
export const RETRY_BASE_MS = 400;               // base backoff pr. retry
export const DELAY_BETWEEN_CATEGORIES_MS = 1800;// delay mellom kategorier (m/ litt jitter)