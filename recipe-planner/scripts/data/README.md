# Offline data artifacts (`scripts/data/`)

This directory stages large, offline third-party bulk downloads consumed by
`scripts/build-usda-seed.js`. The files themselves are **gitignored** (see
`recipe-planner/.gitignore`'s `scripts/data/*` rule) — this README is the
committed provenance record.

## USDA FoodData Central bulk downloads

Downloaded: 2026-07-07, from https://fdc.nal.usda.gov/download-datasets/
License: CC0 / public domain (US government work).

| Artifact | Source URL | Downloaded zip size | Staged as |
|----------|-------------|----------------------|-----------|
| Foundation Foods (JSON) | `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip` | 469 KB | `foundation_foods.zip` -> extracted to `foundation_extract/FoodData_Central_foundation_food_json_2026-04-30.json` |
| SR Legacy (CSV) | `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip` | 6.0 MB | `sr_legacy.zip` -> extracted to `sr_legacy_extract/FoodData_Central_sr_legacy_food_csv_2018-04/` (multiple CSVs; `food.csv` + `food_category.csv` are the two consumed by the join) |

**Why CSV for SR Legacy, not JSON:** per 03-RESEARCH.md, the SR Legacy JSON
unzips to ~205 MB vs. the CSV's ~54 MB — CSV is the smaller variant for this
one dataset (Foundation Foods is small enough either way; JSON was chosen
there since it needs no custom CSV parsing).

**Live counts as staged (2026-07-07):**
- Foundation Foods: 395 array entries, 363 non-null after filtering out ~32
  `null` entries present in this export (a known quirk of the dataset).
- SR Legacy: 7,793 food rows (`food.csv`), matching the "~800 in SR Legacy
  alone" scale RESEARCH.md/CONTEXT.md cite (7,793 total across all food
  groups, not solely household staples).

**Re-download note:** this research was valid until 2026-08-06; if bulk
files are re-acquired after that window, re-verify current filenames/sizes
against the download page — USDA republishes Foundation Foods roughly twice
a year (the 2026-04-30 release was current as of this download). SR Legacy
has not been updated since 2018-04 (it is a frozen/legacy dataset by USDA's
own design — FNDDS/Foundation Foods are its intended successors).

**Fallback if `fdc.nal.usda.gov` is unreachable:** USDA FoodData Central
mirrors exist on Kaggle and `agdatacommons.nal.usda.gov` (same public-domain
data).

## Open Food Facts categories taxonomy

Downloaded: 2026-07-07, from
`https://static.openfoodfacts.org/data/taxonomies/categories.json`.
License: ODbL (Open Database License) — Open Food Facts contributor
community.

| Artifact | Size | Staged as |
|----------|------|-----------|
| Categories taxonomy (full) | 4.6 MB | `off-categories.json` |

14,541 total category nodes (all languages, all branches). Only used as an
input to `build-usda-seed.js`'s Approach-1 (OFF-filtered) candidate-list
generation — filtered at runtime down to English, leaf-level, generic names
under the vegetables/fruits/meats/dairies/cereals-and-potatoes/fats
branches. Not consumed as a bulk seed source directly; see
`scripts/seed-output/catalog-comparison.md` for the filtered-pool size and
sample quality.

## Expected filenames (for a fresh re-download)

```
scripts/data/
├── README.md                                    (committed)
├── foundation_foods.zip                          (gitignored)
├── sr_legacy.zip                                 (gitignored)
├── off-categories.json                           (gitignored)
├── foundation_extract/
│   └── FoodData_Central_foundation_food_json_2026-04-30.json
└── sr_legacy_extract/
    └── FoodData_Central_sr_legacy_food_csv_2018-04/
        ├── food.csv
        └── food_category.csv
        (+ other SR Legacy CSVs, not consumed by this pipeline)
```
