import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

console.log("🧹 Cleaning dist/ ...");
if (existsSync("dist")) {
  if (process.platform === "win32") {
    spawnSync("powershell", ["-NoProfile", "-Command", "Remove-Item -Recurse -Force dist"], { stdio: "ignore" });
  } else {
    spawnSync("rm", ["-rf", "dist"], { stdio: "ignore" });
  }
}

console.log("📦 Phase 1: Building main app (index.html) ...");
const step1 = spawnSync(process.execPath, ["scripts/build-phase1.mjs"], { stdio: "inherit" });
if (step1.status !== 0) {
  console.error("❌ Phase 1 failed with exit code:", step1.status);
  process.exit(step1.status ?? 1);
}

console.log("📦 Phase 2: Building auxiliary pages (login, trips, itinerary, kamui, snow-notes) ...");
const step2 = spawnSync(process.execPath, ["scripts/build-phase2.mjs"], { stdio: "inherit" });
if (step2.status !== 0) {
  console.error("❌ Phase 2 failed with exit code:", step2.status);
  process.exit(step2.status ?? 1);
}

console.log("✨ All pages built successfully into dist/!");
