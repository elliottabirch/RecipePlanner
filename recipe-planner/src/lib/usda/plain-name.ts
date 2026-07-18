/**
 * Pure, dependency-free plain-name derivation for Search-USDA prefill.
 *
 * Kept in its own module (NOT in `usda-lookup.ts`) on purpose: `usda-lookup.ts`
 * statically imports the ~117KB bundled SR-Legacy JSON, and is deliberately
 * lazy-loaded only when the Search-USDA tab opens (T-03-11). Importing this
 * helper from that module would drag the JSON asset into the main chunk. This
 * file has no such import, so the Quick-Create dialog can import it eagerly.
 */

/** Naive English singularizer — same rule set as
 *  `scripts/build-usda-seed.js`'s `singularize` (kept duplicated: that is a
 *  Node build script, this is client code, with no shared module between
 *  them). Left alone for words <= 3 chars to avoid mangling short tokens. */
function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(ses|xes|ches|shes|oes)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Derives a plain, editable product name from a verbose SR-Legacy description,
 * for prefilling the Quick-Create form when a Search-USDA result is picked.
 *
 * This deliberately does NOT touch the bundled index — the full descriptions
 * stay in place because they are what make the search list rankable and
 * disambiguable (`Beef, chuck, arm pot roast, …` tells the cook which cut).
 * Only the *starting name* the user lands on gets cleaned, so a picked
 * `Kumquats, raw` becomes an editable `kumquat` instead of the raw artifact
 * (see the `usda-search-plain-rename` todo).
 *
 * SR-Legacy descriptions are conventionally
 * `HeadNoun, modifier, …, preparation-state`, so the head segment (text before
 * the first comma) is the strongest "what food is this" signal. We take that
 * head, drop any parenthetical aside, lowercase/collapse whitespace, and
 * singularize the head noun. It is intentionally conservative — a sensible
 * starting point the user refines, not a canonical name for all ~7.8k rows
 * (many, e.g. brand/restaurant rows, have no clean plain form at all).
 */
export function plainNameFromUsda(description: string): string {
  const head = (description.split(",")[0] ?? "")
    .replace(/\([^)]*\)/g, " ") // drop parenthetical asides, e.g. "(roasts)"
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!head) return description.trim(); // pathological leading-comma guard
  const words = head.split(" ");
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(" ");
}
