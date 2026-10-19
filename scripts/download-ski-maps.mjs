import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getKamuiMapData } from "../worker/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerJsonPath = path.resolve(__dirname, "../worker/src/ski-resorts-offline-data.json");
const workerJsPath = path.resolve(__dirname, "../worker/src/ski-resorts-offline-data.js");
const publicJsonPath = path.resolve(__dirname, "../public/ski-resorts-offline-data.json");

const resortIds = ["kamui", "santa-present-park", "pippu"];
const results = {};

console.log("開始下載三個雪場的地圖資料...");
for (const resortId of resortIds) {
  console.log(`正在下載 ${resortId}...`);
  const data = await getKamuiMapData(fetch, true, resortId);
  results[resortId] = data;
  console.log(`- ${resortId}: 已下載 ${data.features.length} 條線段 (${data.fetchedAt})`);
}

const json = JSON.stringify(results, null, 2);
fs.writeFileSync(workerJsonPath, json, "utf-8");
fs.writeFileSync(publicJsonPath, json, "utf-8");
fs.writeFileSync(workerJsPath, `export const offlineSkiResortsData = Object.freeze(${json});\n`, "utf-8");

console.log("已成功更新離線圖資檔案：");
console.log(`- ${workerJsonPath}`);
console.log(`- ${workerJsPath}`);
console.log(`- ${publicJsonPath}`);
