import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GeminiVisionAdapter } from "../lib/infra/gemini-vision";
import { parseNarration } from "../lib/domain/narration";

const here = dirname(fileURLToPath(import.meta.url));
const image = readFileSync(join(here, "fixtures/receipt.png"));

console.log(`model: ${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"} · image: ${(image.length / 1024).toFixed(0)} KiB`);

const adapter = new GeminiVisionAdapter(process.env.GEMINI_API_KEY ?? "", process.env.GEMINI_MODEL);
const receipt = await adapter.extractReceipt(image);

console.log("\n=== Gemini extraction ===");
console.log(JSON.stringify(receipt, null, 2));

if (receipt.narration) {
  const parsed = parseNarration(receipt.narration);
  console.log("\n=== narration match ===");
  if (parsed) {
    const { vendorCode, orderRef } = parsed;
    console.log(`parsed GFT-${vendorCode}-${orderRef} → order ref matches fixture GFT-A3-1001: ${vendorCode === "A3" && orderRef === "1001"}`);
  } else {
    console.log("narration did NOT match the GFT-<VENDOR>-<ORDER> pattern");
  }
} else {
  console.log("\nno narration extracted");
}
