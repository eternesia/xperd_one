// Uji lokal: node sample.mjs <foto> [folder-keluaran] → merender semua template di dua rasio.
import fs from "node:fs";
import path from "node:path";
import { renderTemplate, TEMPLATE_IDS } from "./lib.mjs";

const [, , photo, outDir = "out"] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const image = photo
  ? `data:image/${path.extname(photo).slice(1).replace("jpg", "jpeg")};base64,${fs.readFileSync(photo).toString("base64")}`
  : "";
const accents = { promo: "#F59E0B", showcase: "#6D28D9", story: "#10B981" };
for (const template of TEMPLATE_IDS)
  for (const ratio of ["9:16", "1:1"]) {
    const t0 = Date.now();
    const output = path.join(outDir, `${template}-${ratio.replace(":", "x")}.mp4`);
    await renderTemplate({
      template,
      output,
      props: {
        image,
        headline: "Kopi Susu Gula Aren",
        subline: "Segar setiap hari, dibuat saat dipesan",
        badge: "Rp18.000",
        cta: "Pesan sekarang",
        accent: accents[template],
        ratio,
      },
    });
    console.log(`${output} ${((Date.now() - t0) / 1000).toFixed(1)}s ${(fs.statSync(output).size / 1e6).toFixed(2)}MB`);
  }
