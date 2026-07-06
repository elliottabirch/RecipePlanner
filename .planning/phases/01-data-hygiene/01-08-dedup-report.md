# Product Dedup Review Report

Generated: 2026-07-06T17:41:02.114Z
Source: http://192.168.50.95:8090

Edit the companion `dedup-decisions.json` file: set `survivorId` to the ID that should survive the merge and `confirmed: true` for each entry you approve. `merge-products.js` reads ONLY that JSON file and ignores everything else.

## Merge Candidate Clusters (same type)

None found.

## Cross-Type Name Collisions (NOT dupe candidates)

These share a case-insensitive name but have DIFFERENT `type` values (e.g. a `transient` intermediate and a `stored` terminal product). This is a legitimate, intentional pattern (D-12) — merging them would corrupt `shouldCreateInstances()` branching. They are excluded from the JSON decisions skeleton.

### "cucumber sliced" (cross-type — NOT a merge candidate)

| ID | Name | Type | recipe_product_nodes | inventory_items | products | meal_variant_overrides |
|---|---|---|---|---|---|---|
| cz84cwpqe1oe432 | cucumber sliced | transient | 2 | 0 | 0 | 0 |
| 5xnabnb3v9z8350 | cucumber sliced | stored | 2 | 0 | 0 | 0 |

### "onion (red) sliced" (cross-type — NOT a merge candidate)

| ID | Name | Type | recipe_product_nodes | inventory_items | products | meal_variant_overrides |
|---|---|---|---|---|---|---|
| vj1v1hehpt60vpv | onion (red) sliced | transient | 1 | 0 | 0 | 0 |
| 2v232mkw07d446o | onion (red) sliced | stored | 0 | 0 | 0 | 0 |

