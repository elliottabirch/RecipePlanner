import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Box,
  Tabs,
  Tab,
  List,
  ListItemButton,
  ListItemText,
  InputAdornment,
  CircularProgress,
  Chip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { getAll, create, collections } from "../../lib/api";
import type { Product, Store, Section } from "../../lib/types";
import { ProductType } from "../../lib/types";
import { UNIT_DIMENSIONS, type Unit } from "../../lib/units";
import { sectionIdForCategory } from "../../lib/usda/category-section-map";
import type { UsdaEntry } from "../../lib/usda/usda-lookup";

const UNIT_OPTIONS = Object.keys(UNIT_DIMENSIONS) as Unit[];

/** Search-USDA result cap (03-UI-SPEC.md — "cap the rendered list at the top ~20 matches"). */
const USDA_RESULT_CAP = 20;

type QuickCreateMode = "manual" | "usda";

/**
 * The `usda-lookup.ts` module statically imports the bundled 117KB SR-Legacy
 * JSON asset (03-05). To avoid bloating this dialog's chunk with that asset
 * for users who never open the Search USDA tab, the module is dynamically
 * imported only on first tab activation and cached at module scope so it
 * survives across dialog re-opens within the same page session (T-03-11).
 */
let cachedUsdaLookup: typeof import("../../lib/usda/usda-lookup") | null = null;
let usdaLookupPromise: Promise<typeof import("../../lib/usda/usda-lookup")> | null =
  null;

function loadUsdaLookup(): Promise<typeof import("../../lib/usda/usda-lookup")> {
  if (cachedUsdaLookup) return Promise.resolve(cachedUsdaLookup);
  if (!usdaLookupPromise) {
    usdaLookupPromise = import("../../lib/usda/usda-lookup").then((mod) => {
      cachedUsdaLookup = mod;
      return mod;
    });
  }
  return usdaLookupPromise;
}

interface QuickCreateProductDialogProps {
  open: boolean;
  onClose: () => void;
  /** Returns the created product straight into the caller's picker (D-08) — never navigates away. */
  onCreated: (product: Product) => void;
}

/**
 * Phone-friendly minimal product creation, nested inside ShopSwapDialog
 * (D-08). Fields are exactly name + store/section + unit — no more — per
 * the decision record's "ruthlessly minimal" intent. Unit is bound to the
 * Phase-1 unit enum (D-12), not free text.
 *
 * REG-03/D-06: also offers an on-demand "Search USDA" mode that fuzzy-
 * searches the bundled SR-Legacy index and prefills Name + Section + fdc_id
 * — Unit stays manual + required regardless of source (Open Question 4).
 */
export function QuickCreateProductDialog({
  open,
  onClose,
  onCreated,
}: QuickCreateProductDialogProps) {
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const [stores, setStores] = useState<Store[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<QuickCreateMode>("manual");
  const [usdaQuery, setUsdaQuery] = useState("");
  const [usdaResults, setUsdaResults] = useState<UsdaEntry[]>([]);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [selectedUsdaMatch, setSelectedUsdaMatch] = useState<UsdaEntry | null>(
    null
  );
  const unitInputRef = useRef<HTMLInputElement>(null);

  // Reset the form and (re)load store/section options each time the dialog
  // opens — it may be reopened multiple times within one swap session.
  useEffect(() => {
    if (!open) return;
    setName("");
    setStoreId("");
    setSectionId("");
    setUnit("");
    setError(null);
    setMode("manual");
    setUsdaQuery("");
    setUsdaResults([]);
    setSelectedUsdaMatch(null);
    getAll<Store>(collections.stores, { sort: "name" })
      .then(setStores)
      .catch((err) => console.error("Failed to load stores:", err));
    getAll<Section>(collections.sections, { sort: "name" })
      .then(setSections)
      .catch((err) => console.error("Failed to load sections:", err));
  }, [open]);

  const isValid = name.trim().length > 0 && unit !== "";

  const handleModeChange = (_: React.SyntheticEvent, newMode: QuickCreateMode) => {
    setMode(newMode);
    if (newMode === "usda" && !cachedUsdaLookup) {
      setUsdaLoading(true);
      loadUsdaLookup()
        .then((mod) => {
          if (usdaQuery.trim()) {
            setUsdaResults(mod.searchUsda(usdaQuery).slice(0, USDA_RESULT_CAP));
          }
        })
        .catch((err) => console.error("Failed to load USDA catalog:", err))
        .finally(() => setUsdaLoading(false));
    }
  };

  const handleUsdaQueryChange = (query: string) => {
    setUsdaQuery(query);
    if (!cachedUsdaLookup) {
      setUsdaResults([]);
      return;
    }
    setUsdaResults(cachedUsdaLookup.searchUsda(query).slice(0, USDA_RESULT_CAP));
  };

  const handleSelectUsdaMatch = (entry: UsdaEntry) => {
    setName(entry.name);
    const sectionName = sectionIdForCategory(entry.foodCategory);
    if (sectionName) {
      const matchedSection = sections.find(
        (s) => s.name.toLowerCase() === sectionName.toLowerCase()
      );
      if (matchedSection) setSectionId(matchedSection.id);
    }
    setSelectedUsdaMatch(entry);
    setMode("manual");
    // Move focus to the one remaining required field (Open Question 4 —
    // Unit stays manual). Deferred a tick so the manual tab's fields are
    // mounted/visible before we try to focus into them.
    requestAnimationFrame(() => unitInputRef.current?.focus());
  };

  const handleCreate = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const created = await create<Product>(collections.products, {
        name: name.trim(),
        type: ProductType.Raw,
        store: storeId || undefined,
        section: sectionId || undefined,
        canonical_unit: unit as Unit,
        fdc_id: selectedUsdaMatch?.fdc_id,
        usda_data_type: selectedUsdaMatch ? "sr_legacy" : undefined,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      console.error("Failed to create product:", err);
      // Copywriting Contract — quick-create failure copy. Dialog stays open
      // with the user's typed input preserved (do not close on failure).
      setError(
        "Couldn't create that product. Check the name isn't already in use, then try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 20, fontWeight: 600 }}>
        Create Product
      </DialogTitle>
      <Tabs
        value={mode}
        onChange={handleModeChange}
        variant="fullWidth"
        sx={{ mb: 1 }}
      >
        <Tab
          value="manual"
          label="Enter manually"
          sx={{ textTransform: "none", fontSize: 14, fontWeight: 600 }}
        />
        <Tab
          value="usda"
          label="Search USDA"
          sx={{ textTransform: "none", fontSize: 14, fontWeight: 600 }}
        />
      </Tabs>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {mode === "manual" ? (
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <Box>
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                fullWidth
              />
              {selectedUsdaMatch && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`USDA match · fdc:${selectedUsdaMatch.fdc_id}`}
                  sx={{ mt: 0.5, color: "text.secondary", borderColor: "text.secondary" }}
                />
              )}
            </Box>

            <FormControl fullWidth>
              <InputLabel>Store</InputLabel>
              <Select
                value={storeId}
                label="Store"
                onChange={(e) => setStoreId(e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {stores.map((store) => (
                  <MenuItem key={store.id} value={store.id}>
                    {store.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Section</InputLabel>
              <Select
                value={sectionId}
                label="Section"
                onChange={(e) => setSectionId(e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {sections.map((section) => (
                  <MenuItem key={section.id} value={section.id}>
                    {section.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth required>
              <InputLabel>Unit</InputLabel>
              <Select
                inputRef={unitInputRef}
                value={unit}
                label="Unit"
                displayEmpty
                onChange={(e) => setUnit(e.target.value as Unit)}
              >
                <MenuItem value="" disabled>
                  <em>Select a unit</em>
                </MenuItem>
                {UNIT_OPTIONS.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              placeholder="Search USDA foods…"
              value={usdaQuery}
              onChange={(e) => handleUsdaQueryChange(e.target.value)}
              autoFocus
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            {usdaLoading ? (
              <Box
                display="flex"
                flexDirection="column"
                alignItems="center"
                gap={1}
                py={4}
              >
                <CircularProgress size={32} />
                <Typography variant="caption" color="text.secondary">
                  Loading USDA catalog…
                </Typography>
              </Box>
            ) : !usdaQuery.trim() ? (
              <Typography
                variant="caption"
                color="text.secondary"
                align="center"
                sx={{ display: "block", py: 4 }}
              >
                Type to search the USDA catalog
              </Typography>
            ) : usdaResults.length === 0 ? (
              <Typography
                variant="caption"
                color="text.secondary"
                align="center"
                sx={{ display: "block", py: 4 }}
              >
                No USDA matches for &quot;{usdaQuery}&quot;. Try a different
                term, or switch to &quot;Enter manually&quot;.
              </Typography>
            ) : (
              <List dense={false} sx={{ py: 0 }}>
                {usdaResults.map((entry) => (
                  <ListItemButton
                    key={entry.fdc_id}
                    onClick={() => handleSelectUsdaMatch(entry)}
                    sx={{ minHeight: 48 }}
                  >
                    <ListItemText
                      primary={entry.name}
                      secondary={entry.foodCategory}
                      slotProps={{
                        primary: { fontSize: 16, fontWeight: 400 },
                        secondary: {
                          fontSize: 12,
                          fontWeight: 400,
                          color: "text.secondary",
                        },
                      }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={saving || !isValid}
          sx={{ minHeight: 48 }}
        >
          {saving ? "Creating..." : "Create Product"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
