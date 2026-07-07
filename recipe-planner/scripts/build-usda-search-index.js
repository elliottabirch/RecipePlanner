// Offline transform (Phase 3, Plan 05, D-06/REG-03): SR Legacy bulk CSV ->
// trimmed bundled Search-USDA index.
//
// Reads the SAME SR-Legacy bulk CSV staged under scripts/data/ by Plan 03's
// build-usda-seed.js (one download, two consumers — see 03-RESEARCH.md).
// Emits {name, foodCategory, fdc_id} rows only (D-06 target: ~150-250KB
// gzipped over ~7.8k rows). This script performs NO PocketBase writes and
// does NOT call the live FDC API (deferred per D-06) — it is a pure offline
// data transform, run once (re-run only if the staged bulk file changes).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, "data");
const SR_LEGACY_DIR = path.join(
  DATA_DIR,
  "sr_legacy_extract",
  "FoodData_Central_sr_legacy_food_csv_2018-04"
);
const OUTPUT_PATH = path.join(
  __dirname,
  "..",
  "src",
  "assets",
  "usda-sr-legacy.json"
);

/** Minimal quoted-CSV line parser — handles embedded commas and doubled
 *  escaped quotes ("") per RFC 4180, which is all the SR Legacy CSVs use.
 *  (Same parser as scripts/build-usda-seed.js — kept duplicated here since
 *  this script has no other shared-module dependency; both consume the same
 *  bulk CSV shape.) */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function loadCategoryMap() {
  const catLines = fs
    .readFileSync(path.join(SR_LEGACY_DIR, "food_category.csv"), "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);
  const catMap = new Map();
  for (let i = 1; i < catLines.length; i++) {
    const row = parseCsvLine(catLines[i]);
    catMap.set(row[0], row[2]);
  }
  return catMap;
}

/** food.csv -> trimmed {name, foodCategory, fdc_id} rows, joined against
 *  food_category.csv on food_category_id. Drops blank-name and duplicate
 *  (name, fdc_id) rows to keep the bundled asset lean (T-03-10). */
function buildIndex() {
  const catMap = loadCategoryMap();

  const foodLines = fs
    .readFileSync(path.join(SR_LEGACY_DIR, "food.csv"), "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);

  const seen = new Set();
  const rows = [];
  for (let i = 1; i < foodLines.length; i++) {
    const row = parseCsvLine(foodLines[i]);
    const fdc_id = Number(row[0]);
    const name = (row[2] || "").trim();
    const foodCategory = catMap.get(row[3]) || "";

    if (!name || !fdc_id) continue; // drop blank-name/missing-id rows

    const dedupeKey = `${name.toLowerCase()}|${fdc_id}`;
    if (seen.has(dedupeKey)) continue; // drop exact duplicate rows
    seen.add(dedupeKey);

    rows.push({ name, foodCategory, fdc_id });
  }
  return rows;
}

function main() {
  const rows = buildIndex();
  const json = JSON.stringify(rows);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, json, "utf-8");

  const gzipped = zlib.gzipSync(Buffer.from(json, "utf-8"));
  console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
  console.log(`Raw size: ${(json.length / 1024).toFixed(1)} KB`);
  console.log(`Gzipped size: ${(gzipped.length / 1024).toFixed(1)} KB`);
}

main();
