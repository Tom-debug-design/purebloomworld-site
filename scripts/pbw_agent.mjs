// PBW Agent – Amazon Best Sellers → redirects + master links
// Output: r/<ASIN>/index.html, data/products.json, data/links.md, go/*
// Kjør via GitHub Actions (ingen server trengs).

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";   // Node 20 har global fetch

// --- Config/ENV -------------------------------------------------------------
const ASSOC_TAG = (process.env.ASSOC_TAG || "").trim();        // MÅ settes
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/,"");
const DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();

if (!ASSOC_TAG) {
  console.error("Mangler ASSOC_TAG (Amazon OneLink-tag). Avbryter.");
  process.exit(1);
}

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "r");
const DATA_DIR = path.join(ROOT, "data");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Kategorier (10 per som start – kan utvides) ----------------------------
const CATEGORIES = [
  { name: "Top Sellers (All)", url: "https://www.amazon.com/Best-Sellers/zgbs" },
  { name: "Electronics", url: "https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics" },
  { name: "Beauty & Personal Care", url: "https://www.amazon.com/Best-Sellers/zgbs/beauty" },
  { name: "Home & Kitchen", url: "https://www.amazon.com/Best-Sellers/zgbs/kitchen" },
  { name: "Health & Household", url: "https://www.amazon.com/Best-Sellers/zgbs/hpc" },
  { name: "Sports & Outdoors", url: "https://www.amazon.com/Best-Sellers/zgbs/sporting-goods" },
  { name: "Fashion (Women)", url: "https://www.amazon.com/Best-Sellers/zgbs/fashion/7147440011" },
  { name: "Toys & Games", url: "https://www.amazon.com/Best-Sellers/zgbs/toys-and-games" },
  { name: "Tools & Home Improvement", url: "https://www.amazon.com/Best-Sellers/zgbs/hi" },
  { name: "Pet Supplies", url: "https://www.amazon.com/Best-Sellers/zgbs/pet-supplies" }
];

const PER_CATEGORY = 10; // hold lavt først; kan skaleres opp senere

// --- Hjelpere ---------------------------------------------------------------
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));

function buildAffiliateUrl(asin) {
  // OneLink takler geo; bare legg til taggen
  return `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(ASSOC_TAG)}`;
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (PBW Agent; +https://purebloomworld.com)"
    }
  });
  if (!res.ok) throw new Error(`Fetch ${url} -> ${res.status}`);
  return await res.text();
}

function parseCategory(html, limit=PER_CATEGORY) {
  const $ = cheerio.load(html);
  const items = [];
  // Amazon endrer markup ofte; hent alle lenker med /dp/<ASIN>
  const seen = new Set();
  $('a[href*="/dp/"]').each((_,a)=>{
    const href = $(a).attr('href') || "";
    const m = href.match(/\/dp\/([A-Z0-9]{8,14})/i);
    if (!m) return;
    const asin = m[1].toUpperCase();
    if (seen.has(asin)) return;
    seen.add(asin);

    // prøv å finne tittel i nærhet
    const title =
      $(a).attr('title')?.trim() ||
      $(a).text().trim() ||
      $(a).closest('div').find('img[alt]').attr('alt')?.trim() ||
      `ASIN ${asin}`;

    // bilde hvis mulig
    const img =
      $(a).closest('div').find('img').attr('src') ||
      $(a).closest('img').attr('src') ||
      null;

    items.push({ asin, title, img });
  });

  return items.slice(0, limit);
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
}

function writeText(filePath, txt) {
  fs.writeFileSync(filePath, txt, "utf-8");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// --- Generatorer ------------------------------------------------------------
function buildRedirectPage(asin) {
  const url = buildAffiliateUrl(asin);
  const dir = path.join(OUT_DIR, asin);
  ensureDir(dir);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="0; url=${url}">
<title>Redirecting…</title>
<script>location.href=${JSON.stringify(url)};</script>
</head>
<body>Redirecting to Amazon…</body>
</html>`;
  writeText(path.join(dir, "index.html"), html);
}

function buildGoPage(asins) {
  // /go/all -> tilfeldig ett produkt
  const dir = path.join(ROOT, "go");
  ensureDir(dir);
  const picks = asins.slice(0, 200); // limit
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Go</title></head>
<body>
<script>
const asins = ${JSON.stringify(picks)};
const pick = asins[Math.floor(Math.random()*asins.length)];
location.href = ${JSON.stringify((PUBLIC_BASE_URL||"") + "/r/")} + pick + "/";
</script>
</body></html>`;
  writeText(path.join(dir, "index.html"), html);
}

function buildGoCategoryPage(slug, asins) {
  const dir = path.join(ROOT, "go", slug);
  ensureDir(dir);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${slug}</title></head>
<body>
<script>
const asins = ${JSON.stringify(asins)};
const pick = asins[Math.floor(Math.random()*asins.length)];
location.href = ${JSON.stringify((PUBLIC_BASE_URL||"") + "/r/")} + pick + "/";
</script>
</body></html>`;
  writeText(path.join(dir, "index.html"), html);
}

function writeLinksMD(sections){
  const lines = [];
  lines.push(`# PBW Links (${new Date().toISOString()})\n`);
  for(const s of sections){
    lines.push(`## ${s.name}`);
    for(const p of s.items){
      lines.push(`- [${p.title}](${buildAffiliateUrl(p.asin)})`);
    }
    lines.push("");
  }
  writeText(path.join(DATA_DIR, "links.md"), lines.join("\n"));
}

function writeProductsJSON(sections){
  const all = sections.flatMap(s => s.items.map(p => ({
    asin: p.asin,
    title: p.title,
    img: p.img,
    url: buildAffiliateUrl(p.asin),
    category: s.name
  })));
  writeJSON(path.join(DATA_DIR, "products.json"), {
    generated_at: new Date().toISOString(),
    count: all.length,
    items: all
  });
}

async function postDiscordTop10(sections){
  if(!DISCORD_WEBHOOK) return;
  try{
    const top = sections[0]?.items?.slice(0, 10) || [];
    if(top.length === 0) return;
    const content = top.map((p,i)=>`${i+1}. ${p.title} — ${buildAffiliateUrl(p.asin)}`).join("\n");
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({ content: `**PBW Top 10**\n${content}` })
    });
  }catch(e){ console.error("Discord post feilet:", e.message); }
}

// --- Main -------------------------------------------------------------------
async function main(){
  const sections = [];
  for (const cat of CATEGORIES){
    try{
      console.log("Henter:", cat.name, cat.url);
      const html = await fetchHTML(cat.url);
      const items = parseCategory(html, PER_CATEGORY);
      for (const p of items) buildRedirectPage(p.asin);
      sections.push({ name: cat.name, items });
      await sleep(800); // rolig tempo
    }catch(e){
      console.error("ERR", cat.name, e.message);
    }
  }

  writeLinksMD(sections);
  writeProductsJSON(sections);

  const ALL = sections.flatMap(s => s.items.map(p => p.asin));
  buildGoPage(ALL);
  for (const s of sections){
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    buildGoCategoryPage(slug, s.items.map(p => p.asin));
  }

  await postDiscordTop10(sections);
  console.log("✔ Agent run complete:", ALL.length, "redirects");
}

main().catch(e => { console.error(e); process.exit(1); });