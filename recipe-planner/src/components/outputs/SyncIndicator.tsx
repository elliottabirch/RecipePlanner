import { Box, CircularProgress, Typography } from "@mui/material";
import {
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
} from "@mui/icons-material";

export interface SyncIndicatorProps {
  /** Count of shopping_state writes currently in flight or awaiting retry. */
  pendingCount: number;
  /** Count of writes that exhausted retries (still queued, per D-13). */
  failed: number;
}

/**
 * Pending-sync indicator (D-13, SHOP-07, 02-UI-SPEC surface 6).
 *
 * Presentational only — always renders exactly one of three states, never a
 * hidden/idle state, so the shopper has a persistent connectivity signal:
 *   - Synced: no pending or failed writes.
 *   - Saving… (n): pendingCount > 0.
 *   - Can't reach server — retrying: failed > 0 (retry-exhausted but still
 *     queued, per D-13's in-memory-only optimistic queue).
 *
 * Failures surface via this indicator's copy only — no error text is
 * rendered here; the page-level error state handles user-facing failures
 * elsewhere (02-PATTERNS error-handling note).
 */
export function SyncIndicator({ pendingCount, failed }: SyncIndicatorProps) {
  if (failed > 0) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, height: 32 }}>
        <CloudOffIcon fontSize="small" color="warning" />
        <Typography variant="caption" sx={{ fontWeight: 400 }}>
          Can&apos;t reach server — retrying
        </Typography>
      </Box>
    );
  }

  if (pendingCount > 0) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, height: 32 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" sx={{ fontWeight: 400 }}>
          Saving… ({pendingCount})
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, height: 32 }}>
      <CloudDoneIcon fontSize="small" color="action" />
      <Typography variant="caption" sx={{ fontWeight: 400 }}>
        Synced
      </Typography>
    </Box>
  );
}
