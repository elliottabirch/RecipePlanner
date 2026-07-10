import Fuse, { type IFuseOptions } from "fuse.js";
import type { Product } from "../types";

interface SearchableProduct extends Product {
  /** Words alpha-sorted + joined — makes "paste tomato" and "tomato paste"
   *  the same string, giving word-order independence without a custom
   *  tokenizer. Combined with the plain `name` key (still typo-tolerant via
   *  Fuse's per-character fuzzy match) so a single-word typo still ranks. */
  _sortedTokens: string;
}

function toSortedTokens(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

const FUSE_OPTIONS: IFuseOptions<SearchableProduct> = {
  keys: [
    { name: "name", weight: 0.6 },
    { name: "_sortedTokens", weight: 0.4 },
  ],
  threshold: 0.35, // 0 = exact, 1 = match anything; 0.3-0.4 tolerates 1-2 char typos on short words
  ignoreLocation: true, // match position in string doesn't matter
  includeScore: true,
};

/**
 * Single reusable client-side fuzzy/token product search (REG-02, D-05).
 * Wired into every product-search surface (registry list, RecipeEditor
 * Autocompletes, ProductForm duplicate-check, ShopSwapDialog replacement
 * Autocomplete) so typos and reordered words all rank the right product
 * first — one config, not five divergent ones.
 */
export function searchProducts<T extends Product>(
  query: string,
  products: T[]
): T[] {
  if (!query.trim()) return products;

  const indexed: (SearchableProduct & { __original: T })[] = products.map(
    (p) => ({
      ...p,
      _sortedTokens: toSortedTokens(p.name),
      __original: p,
    })
  );

  const fuse = new Fuse(indexed, FUSE_OPTIONS);
  return fuse.search(query).map((result) => result.item.__original);
}

/**
 * Scored variant of {@link searchProducts} for the import D-02 confidence gate.
 * `searchProducts` sets `includeScore: true` but DISCARDS the score (Pitfall 5);
 * this keeps it so import product-matching can threshold on a number
 * (lower = better; 0 = exact). Reuses the same FUSE_OPTIONS + toSortedTokens
 * indexing so ranking is identical to app search — no near-dupe divergence.
 * Returns [] for an empty/whitespace query (nothing to score).
 */
export function scoreProduct<T extends Product>(
  query: string,
  products: T[]
): { product: T; score: number }[] {
  if (!query.trim()) return [];

  const indexed: (SearchableProduct & { __original: T })[] = products.map(
    (p) => ({
      ...p,
      _sortedTokens: toSortedTokens(p.name),
      __original: p,
    })
  );

  const fuse = new Fuse(indexed, FUSE_OPTIONS);
  return fuse
    .search(query)
    .map((result) => ({
      product: result.item.__original,
      score: result.score ?? 1,
    }));
}
