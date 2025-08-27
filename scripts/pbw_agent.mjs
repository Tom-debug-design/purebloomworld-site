// PBW Agent – Amazon Best Sellers → redirects + master links
// Output: r/<ASIN>/index.html, products.json, links.md, go/*
// Kjør via GitHub Actions (ingen server trengs).

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const ASSOC_TAG = process.env.ASSOC_TAG || "";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "r");

// Juster kategorier her (10 per kategori for start – kan økes senere)
const CATEGORIES = [
  { name: "Top Sellers (All)", url: "https://www.amazon.com/Best-Sellers/zgbs" },
  { name: "Electronics", url: "https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics" },
  { name: "Beauty & Personal Care", url: "https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty" },
  { name: "Home & Kitchen", url: "https://www.amazon.com/Best-Sellers-Kitchen-Dining/zgbs/kitchen" },
  { name: "Health & Household", url: "https://www.amazon.com/Best-Sellers-Health-Household/zgbs/hpc" },
  { name: "Sports & Outdoors", url: "https://www.amazon.com/Best-Sellers-Sports-Outdoors/zgbs/sporting-goods" }
];

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }
function toAbs(u){ return u?.startsWith("http") ? u : `https://www.amazon.com${u||""}`; }
function asinFromHref(h){
  if(!h) return "";
  const m = h.match(/\/dp\/([A-Z0-9]{10})/) || h.match(/\/gp\/product\/([A-Z0-9]{10})/);
  return m ? m[1] : "";
}
function tagUrl(asin){
  const base = `https://www.amazon.com/dp/${asin}/`;
  return ASSOC_TAG ? `${base}?tag=${encodeURIComponent(ASSOC_TAG)}` : base;
}
function escapeHtml(s){ return (s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function scrape(url){
  const res = await fetch(url, { headers: { "User-Agent":"Mozilla/5.0", "Accept-Language":"en-US,en;q=0.9" }});
  const html = await res.text();
  const $ = cheerio.load(html);
  const out = [];

  // Ny/gammel layout
  $("div.zg-grid-general-faceout, div.p13n-sc-uncoverable-faceout, div._cDEzb_p13n-sc-uncoverable-faceout_3E_iN").each((_, el)=>{
    const $el = $(el);
    const a = $el.find("a[href*='/dp/'], a.a-link-normal").first();
    const href = toAbs(a.attr("href"));
    const asin = asinFromHref(href);
    const title = ($el.find("img").attr("alt") || $el.find("span.a-size-base").first().text() || "").trim();
    if(asin && title) out.push({ asin, title });
  });

  if(out.length < 10){
    $("a[href*='/dp/']").each((_, a)=>{
      const href = toAbs($(a).attr("href"));
      const asin = asinFromHref(href);
      const title = ($(a).find("img").attr("alt") || $(a).text() || "").trim();
      if(asin && title) out.push({ asin, title });
    });
  }

  // Dedup + cap 10
  const seen = new Set(); const uniq = [];
  for(const p of out){ if(!seen.has(p.asin)){ seen.add(p.asin); uniq.push(p); } }
  return uniq.slice(0, 10);
}

function buildRedirectPage(asin, title){
  const dir = path.join(OUT_DIR, asin);
  ensureDir(dir);
  const url = tagUrl(asin);
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>Redirecting… ${escapeHtml(title)}</title>
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="0; url='${url}'">
<link rel="canonical" href="${url}">
<script>location.replace(${JSON.stringify(url)});</script>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}.w{max-width:560px;padding:24px;text-align:center}.b{display:inline-block;padding:10px 14px;border:1px solid #ccc;border-radius:10px;text-decoration:none;margin-top:10px}</style>
</head><body><div class="w"><h1>Sending you to Amazon…</h1><p>If not redirected, use button.</p><a class="b" href="${url}" rel="nofollow sponsored noopener">Continue</a></div></body></html>`;
  const out = path.join(dir, "index.html");
  const prev = fs.existsSync(out) ? fs.readFileSync(out,"utf8") : "";
  if(prev.trim() !== html.trim()){ fs.writeFileSync(out, html); return true; }
  return false;
}

function writeLinksMD(sections){
  const base = PUBLIC_BASE_URL || "https://YOUR-PAGES";
  const lines = ["# PBW Redirect Links\n"];
  for(const s of sections){
    lines.push(`## ${s.name}`);
    s.items.forEach((p,i)=> lines.push(`${i+1}. ${p.title}\n   ${base}/r/${p.asin}/`));
    lines.push("");
  }
  const next = lines.join("\n");
  const prev = fs.existsSync("links.md") ? fs.readFileSync("links.md","utf8") : "";
  if(prev.trim() !== next.trim()){ fs.writeFileSync("links.md", next); return true; }
  return false;
}

function writeProductsJSON(sections){
  const data = { updated: new Date().toISOString(), sections: {} };
  for(const s of sections){
    const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    data.sections[key] = s.items.map(p => ({ asin: p.asin, title: p.title }));
  }
  fs.writeFileSync("products.json", JSON.stringify(data, null, 2));
}

function buildGoPage(asins){
  ensureDir("go");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Go</title>
<script>
const asins=${JSON.stringify(asins)};
function pick(a){return a[Math.floor(Math.random()*a.length)]}
const a=pick(asins);
location.replace("https://www.amazon.com/dp/"+a+"${ASSOC_TAG?`?tag=${ASSOC_TAG}`:""}");
</script></head><body></body></html>`;
  fs.writeFileSync("go/index.html", html);
}
function buildGoCategoryPage(slug, asins){
  const dir = path.join("go", slug); ensureDir(dir);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Go ${slug}</title>
<script>
const asins=${JSON.stringify(asins)};
function pick(a){return a[Math.floor(Math.random()*a.length)]}
const a=pick(asins);
location.replace("https://www.amazon.com/dp/"+a+"${ASSOC_TAG?`?tag=${ASSOC_TAG}`:""}");
</script></head><body></body></html>`;
  fs.writeFileSync(path.join(dir,"index.html"), html);
}

async function postDiscordTop10(sections){
  const hook = process.env.DISCORD_WEBHOOK_URL; if(!hook) return;
  const base = PUBLIC_BASE_URL || "https://YOUR-PAGES";
  const top = sections.flatMap(s => s.items.slice(0,2)).slice(0,10)
    .map((p,i)=> `${i+1}. ${p.title}\n${base}/r/${p.asin}/`).join("\n");
  await fetch(hook, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ content: `**PBW – Fresh Best Sellers**\n${top}` }) });
}

async function main(){
  ensureDir(OUT_DIR);
  const sections = [];
  for(const cat of CATEGORIES){
    try{
      const items = await scrape(cat.url);
      items.forEach(p => buildRedirectPage(p.asin, p.title));
      sections.push({ name: cat.name, items });
      await new Promise(r=>setTimeout(r, 800));
    }catch(e){
      console.error("ERR", cat.name, e.message);
    }
  }

  writeLinksMD(sections);
  writeProductsJSON(sections);

  const ALL = sections.flatMap(s => s.items.map(p => p.asin));
  buildGoPage(ALL);
  for(const s of sections){
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    buildGoCategoryPage(slug, s.items.map(p => p.asin));
  }

  await postDiscordTop10(sections);
  console.log("✓ Agent run complete:", ALL.length, "redirects");
}
main().catch(e => { console.error(e); process.exit(1); });