import Fuse, { type IFuseOptions } from "fuse.js";
import usdaIndex from "../../assets/usda-sr-legacy.json";

/**
 * A trimmed SR-Legacy row from the bundled Search-USDA index
 * (`src/assets/usda-sr-legacy.json`, built by
 * `scripts/build-usda-search-index.js`).
 */
export interface UsdaEntry {
  name: string;
  foodCategory: string;
  fdc_id: number;
}

/**
 * Same fuse.js matching approach as `src/lib/search/product-search.ts`
 * (D-05) — one search engine, not a second — configured for the bundled
 * Search-USDA index instead of the live `Product[]` array.
 */
const FUSE_OPTIONS: IFuseOptions<UsdaEntry> = {
  keys: ["name"],
  threshold: 0.35,
  ignoreLocation: true,
};

const fuse = new Fuse<UsdaEntry>(usdaIndex as UsdaEntry[], FUSE_OPTIONS);

/**
 * Fuzzy-searches the bundled, fully-offline SR-Legacy index (D-06, REG-03) —
 * no network round-trip, no live FDC API (deferred). Empty/whitespace query
 * returns `[]` rather than dumping the whole ~7.8k-row index.
 */
export function searchUsda(query: string): UsdaEntry[] {
  if (!query.trim()) return [];
  return fuse.search(query).map((result) => result.item);
}
