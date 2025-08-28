// scripts/pbw_agent.mjs
import fs from "node:fs/promises";
import path from "node:path";

const WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();
const AFFIL_TAG = (process.env.AFFIL_TAG || "").trim();

const items = Array.from({ length: 20 }, (_, i) => ({
  id: `B0TEST${String(i + 1).padStart(2, "0")}`,
  title: `Mock Product #${i + 1}${AFFIL_TAG ? ` (${AFFIL_TAG})` : ""}`,
}));

const outDir = path.join(process.cwd(), "data");
await fs.mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "top_sellers.json");
await fs.writeFile(
  outFile,
  JSON.stringify({ ts: new Date().toISOString(), items }, null, 2),
  "utf-8"
);
console.log(`✚ Skrev ${outFile} med ${items.length} items.`);

// Node 18+ har global fetch
if (WEBHOOK) {
  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `PBW Agent: oppdatert ${items.length} toppselgere ✅`,
      }),
    });
    console.log(`Discord status: ${res.status}`);
  } catch (e) {
    console.warn("Discord-post feilet (hopper videre):", e?.message || e);
  }
} else {
  console.log("ℹ️  DISCORD_WEBHOOK ikke satt – skipper Discord-post.");
}

console.log("PBW agent ferdig.");