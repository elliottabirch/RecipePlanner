// Scheduler config load/save helper (PREP-05, D-06). scheduler_config is a
// low-frequency singleton write — no sync-queue needed here (05-PATTERNS.md
// "Shared Patterns > Optimistic CRUD + sync queue" explicitly excludes it
// from that treatment: a plain getAll/update on slider-release-debounce is
// sufficient). Read by both WeightsPanel.tsx (this write path) and
// CookMode.tsx's regenerate flow (which re-reads the same singleton before
// calling generateSchedule).
import { getAll, update, collections } from "../api";
import type { SchedulerConfig } from "../types";

/** Load the scheduler_config singleton (seeded once in Phase 5 Plan 01).
 * Returns `null` if it's somehow missing — callers decide on a fallback
 * (CookMode.tsx already has `fallbackSchedulerConfig`). */
export async function loadSchedulerConfig(): Promise<SchedulerConfig | null> {
  const configs = await getAll<SchedulerConfig>(collections.schedulerConfig);
  return configs[0] ?? null;
}

/** Patch-update the scheduler_config singleton by its record id — the
 * write-on-release target for WeightsPanel's debounced slider persistence
 * (T-05-12a: never a write per drag tick). */
export async function saveSchedulerConfig(
  id: string,
  patch: Partial<SchedulerConfig>
): Promise<SchedulerConfig> {
  return update<SchedulerConfig>(collections.schedulerConfig, id, patch);
}
