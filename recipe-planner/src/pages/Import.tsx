import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  AlertTitle,
  Autocomplete,
  Paper,
  Stack,
  CircularProgress,
} from "@mui/material";
import { getAll, create, collections } from "../lib/api";
import { type Product, ProductType } from "../lib/types";
import { normalizeUnit } from "../lib/units";
import {
  validateImportJson,
  type ImportError,
  type NormalizedGraph,
} from "../lib/import/validate-import";
import { classifyImportNodes } from "../lib/import/classify-nodes";
import { buildRecipeGraph } from "../lib/import/build-recipe-graph";
import { scoreProduct, searchProducts } from "../lib/search/product-search";
import { QuickCreateProductDialog } from "../components/outputs/QuickCreateProductDialog";

/**
 * Import page (IMP-02, D-01/D-02/D-05) — retires the test-DB migration ritual
 * (IMP-03). The user pastes D-01 recipe JSON; we validate it with the pure
 * `validateImportJson` normalizer (which NEVER throws/blocks — problems surface
 * inline as MUI Alerts), auto-match confident products via `scoreProduct`,
 * resolve any unmatched/low-confidence lines inline (reusing
 * `QuickCreateProductDialog` so every line ends with a store/section/unit —
 * avoids the shopping-list-dropout bug), then land the recipe directly in prod
 * as a DRAFT via the shared `buildRecipeGraph({status:"draft"})` write-spine
 * and redirect into RecipeEditor for review.
 *
 * FIRST-CLASS INVARIANT (threat T-06-07a/b/c): importing never hard-blocks and
 * writes NOTHING until the paste is valid AND every product line is resolved.
 * The "Import recipe" button stays enabled to re-attempt after edits; only the
 * final resolved-land calls buildRecipeGraph.
 */

// Confidence gate for auto-matching a pasted ingredient name to an existing
// product (D-02). `scoreProduct` returns lower = better, 0 = exact; anything at
// or under this threshold is treated as a confident auto-match, everything else
// drops into the inline "Match these products" step. Starting conservative so
// the user reviews near-misses rather than silently mis-matching.
const AUTO_MATCH_THRESHOLD = 0.15;

export default function ImportRecipe() {
  const navigate = useNavigate();

  const [text, setText] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  // Validation output. `errors` non-null => the paste failed structural
  // validation (non-blocking; button stays enabled). `warnings` are the
  // never-reject enum normalizations (unknown timing/resource → undefined).
  const [errors, setErrors] = useState<ImportError[] | null>(null);
  const [warnings, setWarnings] = useState<ImportError[]>([]);

  // Post-parse resolution state. `graph` holds the validated NormalizedGraph;
  // `matches` maps a product node ref → resolved productId (auto-matched,
  // hinted, or user-resolved); `unresolvedRefs` are the lines still needing a
  // pick/quick-create before the draft can land.
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [unresolvedRefs, setUnresolvedRefs] = useState<string[]>([]);
  const [parseInfo, setParseInfo] = useState<{
    ingredients: number;
    steps: number;
    unmatched: number;
    made: number;
  } | null>(null);

  const [quickCreateForRef, setQuickCreateForRef] = useState<string | null>(
    null
  );
  const [landing, setLanding] = useState(false);
  const [landError, setLandError] = useState<string | null>(null);

  useEffect(() => {
    getAll<Product>(collections.products, { sort: "name" })
      .then(setProducts)
      .catch((err) => console.error("Failed to load products:", err));
  }, []);

  /**
   * Land the resolved graph as a DRAFT and redirect into RecipeEditor (D-05).
   * Takes the graph + match map as args (not state) so it can be called
   * synchronously right after a validate that had zero unmatched lines, before
   * React has flushed the setState calls.
   */
  const landDraft = async (
    g: NormalizedGraph,
    m: Record<string, string>
  ) => {
    setLanding(true);
    setLandError(null);
    try {
      const resolvedGraph: NormalizedGraph = {
        ...g,
        recipe: { ...g.recipe, status: "draft" },
        productNodes: g.productNodes.map((pn) => ({
          ...pn,
          matchProductId: m[pn.ref] ?? pn.matchProductId,
        })),
      };
      const { recipeId } = await buildRecipeGraph(resolvedGraph);
      navigate("/recipes/" + recipeId);
    } catch (e) {
      console.error("Failed to land import draft:", e);
      setLandError(
        "Couldn't land the draft. " +
          (e instanceof Error ? e.message : String(e))
      );
      setLanding(false);
    }
    // note: no finally-clear on success — we navigate away.
  };

  const handleImport = async () => {
    setLandError(null);
    const res = validateImportJson(text);

    if (!res.ok) {
      // Non-blocking: surface problems, keep the button enabled, write nothing.
      setErrors(res.errors);
      setWarnings([]);
      setGraph(null);
      setParseInfo(null);
      setMatches({});
      setUnresolvedRefs([]);
      return;
    }

    setErrors(null);
    setWarnings(res.warnings);
    const g = res.graph;

    // A product is something you BUY (raw) or something the recipe MAKES
    // (transient/stored — the output of a step). Only raw leaf inputs need a
    // store/section; made products are auto-created without one (a recipe's own
    // output isn't a purchase). See classifyImportNodes.
    const roles = classifyImportNodes(g);
    const localProducts = [...products];

    // Resolve products: hinted matchProductId wins; else confident auto-match;
    // else raw → inline "Match these products" step (D-02); made → auto-create
    // as a stored/transient product (no store/section prompt).
    const nextMatches: Record<string, string> = {};
    const unresolved: string[] = [];
    let madeCreated = 0;
    for (const pn of g.productNodes) {
      if (pn.matchProductId) {
        nextMatches[pn.ref] = pn.matchProductId;
        continue;
      }
      const scored = scoreProduct(pn.name, localProducts);
      if (scored.length > 0 && scored[0].score <= AUTO_MATCH_THRESHOLD) {
        nextMatches[pn.ref] = scored[0].product.id;
        continue;
      }
      if (roles[pn.ref] === "raw") {
        unresolved.push(pn.ref);
        continue;
      }
      // Made product (the recipe's output/intermediate): create it directly as
      // a stored/transient product with NO store/section. If creation fails,
      // fall back to the manual resolve step so nothing silently breaks.
      try {
        const cu = normalizeUnit(pn.unit);
        const created = await create<Product>(collections.products, {
          name: pn.name,
          type:
            roles[pn.ref] === "transient"
              ? ProductType.Transient
              : ProductType.Stored,
          ...(cu ? { canonical_unit: cu } : {}),
        });
        nextMatches[pn.ref] = created.id;
        localProducts.push(created);
        madeCreated += 1;
      } catch (e) {
        console.error("Failed to auto-create made product:", pn.name, e);
        unresolved.push(pn.ref);
      }
    }

    setProducts(localProducts);
    setGraph(g);
    setMatches(nextMatches);
    setUnresolvedRefs(unresolved);
    setParseInfo({
      ingredients: g.productNodes.length,
      steps: g.steps.length,
      unmatched: unresolved.length,
      made: madeCreated,
    });

    // Fully resolved on first pass → land immediately (no gate).
    if (unresolved.length === 0) {
      void landDraft(g, nextMatches);
    }
  };

  const assignProduct = (ref: string, productId: string) => {
    setMatches((m) => ({ ...m, [ref]: productId }));
    setUnresolvedRefs((refs) => refs.filter((r) => r !== ref));
  };

  const handleQuickCreated = (ref: string) => (product: Product) => {
    setProducts((ps) => [...ps, product]);
    assignProduct(ref, product.id);
    setQuickCreateForRef(null);
  };

  const showEmptyState = !errors && !graph && warnings.length === 0;
  const inMatchStep = graph !== null && unresolvedRefs.length > 0;
  const readyToFinish = graph !== null && unresolvedRefs.length === 0;

  return (
    <Box sx={{ maxWidth: 820, mx: "auto" }}>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
        Import a recipe
      </Typography>

      {showEmptyState && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Paste structured recipe JSON below, then Import. It lands as a draft
          you can review and edit before publishing.
        </Typography>
      )}

      <TextField
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{ "recipe": { "name": "..." }, "products": [...], "steps": [...], "edges": [...] }'
        multiline
        minRows={10}
        fullWidth
        slotProps={{
          input: { sx: { fontFamily: "monospace", fontSize: 13 } },
        }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => void handleImport()}
          disabled={landing || text.trim() === ""}
          sx={{ minHeight: 48 }}
        >
          Import recipe
        </Button>
        {landing && <CircularProgress size={24} />}
      </Box>

      {/* Structural validation problems — non-blocking. Nothing was saved. */}
      {errors && errors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>
            Couldn&apos;t read part of this JSON. Fix the items below and Import
            again — nothing is saved until you do.
          </AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </Box>
        </Alert>
      )}

      {/* Never-reject enum normalizations (unknown timing/resource → undefined). */}
      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </Box>
        </Alert>
      )}

      {/* Parse-OK feedback. */}
      {parseInfo && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Recipe parsed — {parseInfo.ingredients} ingredients,{" "}
          {parseInfo.steps} steps.
          {parseInfo.made > 0
            ? ` Created ${parseInfo.made} made product${
                parseInfo.made === 1 ? "" : "s"
              } (recipe outputs).`
            : ""}
          {parseInfo.unmatched > 0
            ? ` ${parseInfo.unmatched} ingredient${
                parseInfo.unmatched === 1 ? "" : "s"
              } need matching before import.`
            : ""}
        </Alert>
      )}

      {landError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {landError}
        </Alert>
      )}

      {/* Inline "Match these products" step — every unresolved line must end
          with a resolved productId before the draft can land (D-02). */}
      {inMatchStep && graph && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Match these products
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {unresolvedRefs.length} ingredient
            {unresolvedRefs.length === 1 ? " isn't" : "s aren't"} in your
            registry yet. Pick an existing product, quick-create one, or search
            USDA — so every line has a store, section, and unit.
          </Typography>

          <Stack spacing={2}>
            {unresolvedRefs.map((ref) => {
              const node = graph.productNodes.find((p) => p.ref === ref);
              if (!node) return null;
              return (
                <Box
                  key={ref}
                  sx={{
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Typography sx={{ minWidth: 160, fontWeight: 500 }}>
                    {node.name}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.5 }}
                    >
                      ({node.unit})
                    </Typography>
                  </Typography>
                  <Autocomplete<Product>
                    options={products}
                    getOptionLabel={(p) => p.name}
                    filterOptions={(opts, state) =>
                      searchProducts(state.inputValue, opts)
                    }
                    onChange={(_, value) => {
                      if (value) assignProduct(ref, value.id);
                    }}
                    sx={{ minWidth: 260, flexGrow: 1 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Pick an existing product"
                        size="small"
                      />
                    )}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => setQuickCreateForRef(ref)}
                    sx={{ minHeight: 40 }}
                  >
                    Quick create
                  </Button>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* All lines resolved via the match step → land the draft. */}
      {readyToFinish && parseInfo && parseInfo.unmatched > 0 && (
        <Button
          variant="contained"
          color="primary"
          onClick={() => graph && landDraft(graph, matches)}
          disabled={landing}
          sx={{ minHeight: 48 }}
        >
          Finish import
        </Button>
      )}

      <QuickCreateProductDialog
        open={quickCreateForRef !== null}
        onClose={() => setQuickCreateForRef(null)}
        onCreated={
          quickCreateForRef
            ? handleQuickCreated(quickCreateForRef)
            : () => {}
        }
      />
    </Box>
  );
}
