/**
 * Resource-feasibility model for the prep-day GA scheduler (PREP-03, D-05).
 *
 * Pure, side-effect-free functions consumed by the SSGS decoder (Plan 09)
 * and the check-off retime pass (Plan 10). Models:
 *  - the implicit singleton "cook" resource — busy ONLY during a step's
 *    `active_minutes` window, never during `passive_minutes` (D-05/A2). This
 *    is what lets one step's passive window absorb another step's active
 *    work, per 05-RESEARCH.md Pattern 2.
 *  - oven: same-temperature-only overlap (a temperature conflict rejects
 *    regardless of rack capacity — RESEARCH Pitfall 2), metered above that
 *    by `rack_slots` vs. `scheduler_config.oven_rack_slots`.
 *  - stovetop: metered by `scheduler_config.burner_count` (default 2).
 *  - singleton appliances (blender/food_processor/instant_pot/microwave/
 *    sous_vide): capacity 1 each.
 *
 * Within a single step, `active_minutes` occurs first, `passive_minutes`
 * second: `[start, start+active)` is cook-busy AND resource-busy;
 * `[start+active, start+active+passive)` is resource-busy only (or nothing
 * busy when `resource === "none"`) — RESEARCH A2.
 */
import type { RecipeStep } from "../types";
import type { ResourceTimeline, SingletonAppliance } from "./types";

/** Capacity inputs `isFeasibleAt` needs from `scheduler_config`. */
export interface ResourceCapacityConfig {
  ovenRackSlots: number;
  burnerCount: number;
}

/** Appliances modeled as capacity-1 singletons (D-05). Single source of the
 * list so adding an appliance touches one place. */
export const SINGLETON_APPLIANCES: readonly SingletonAppliance[] = [
  "blender",
  "food_processor",
  "instant_pot",
  "microwave",
  "sous_vide",
];

function isSingletonAppliance(resource: string): resource is SingletonAppliance {
  return (SINGLETON_APPLIANCES as readonly string[]).includes(resource);
}

/** `[aStart, aEnd)` vs `[bStart, bEnd)` half-open interval overlap. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** A fresh, empty resource timeline. Capacities (`oven_rack_slots`,
 * `burner_count`) are supplied per-call to `isFeasibleAt` from
 * `scheduler_config`, not stored on the timeline itself, so no config input
 * is needed here. */
export function emptyResourceTimeline(): ResourceTimeline {
  return {
    cookBusy: [],
    ovenUsage: [],
    activeBurners: [],
    singletonAppliances: Object.fromEntries(
      SINGLETON_APPLIANCES.map((name) => [name, []])
    ) as unknown as ResourceTimeline["singletonAppliances"],
  };
}

/**
 * Can `step` start at `candidateStart` without violating the implicit cook,
 * oven temperature/rack, stovetop burner, or singleton-appliance
 * constraints? Pure predicate — does not mutate `timeline`.
 */
export function isFeasibleAt(
  candidateStart: number,
  step: Pick<RecipeStep, "active_minutes" | "passive_minutes" | "resource" | "oven_temp_f" | "rack_slots">,
  timeline: ResourceTimeline,
  config: ResourceCapacityConfig
): boolean {
  const active = step.active_minutes ?? 0;
  const passive = step.passive_minutes ?? 0;
  const resource = step.resource ?? "none";
  const activeEnd = candidateStart + active;
  const resourceEnd = activeEnd + passive;

  // (1) the implicit singleton cook is busy only during the active window —
  // no two steps' active windows may overlap, regardless of resource.
  if (timeline.cookBusy.some((w) => overlaps(candidateStart, activeEnd, w.start, w.end))) {
    return false;
  }

  // (2) oven: temperature-conflict short-circuits BEFORE rack-slot capacity
  // (Pitfall 2) — two different-temp bakes can never overlap no matter how
  // much rack capacity is free.
  if (resource === "oven") {
    const overlapping = timeline.ovenUsage.filter((u) =>
      overlaps(candidateStart, resourceEnd, u.start, u.end)
    );
    if (overlapping.some((u) => u.tempF !== step.oven_temp_f)) {
      return false;
    }
    const rackSlots = step.rack_slots ?? 1;
    const totalRackSlots = overlapping.reduce((sum, u) => sum + u.rackSlots, 0) + rackSlots;
    if (totalRackSlots > config.ovenRackSlots) {
      return false;
    }
  }

  // (3) stovetop: metered by burner_count across the full resource window
  // (active + passive — a simmering pot still occupies its burner).
  if (resource === "stovetop") {
    const concurrent = timeline.activeBurners.filter((b) =>
      overlaps(candidateStart, resourceEnd, b.start, b.end)
    ).length;
    if (concurrent + 1 > config.burnerCount) {
      return false;
    }
  }

  // (4) singleton appliances: capacity 1 each.
  if (isSingletonAppliance(resource)) {
    const busy = timeline.singletonAppliances[resource];
    if (busy.some((w) => overlaps(candidateStart, resourceEnd, w.start, w.end))) {
      return false;
    }
  }

  // (5) resource === "none": occupies only the cook during the active
  // window (already checked in (1)); no appliance footprint.
  return true;
}

/**
 * Record `step`'s footprint into `timeline` at `[start, end)`, where `end`
 * is the step's full resource-window end (`start + active + passive`).
 * Mutates `timeline` in place — call once per step, after `isFeasibleAt`
 * has confirmed `start` is feasible.
 */
export function occupyResources(
  timeline: ResourceTimeline,
  step: Pick<RecipeStep, "active_minutes" | "passive_minutes" | "resource" | "oven_temp_f" | "rack_slots">,
  start: number,
  end: number
): void {
  const active = step.active_minutes ?? 0;
  const resource = step.resource ?? "none";
  const activeEnd = start + active;

  // The cook is occupied for the active window only, regardless of resource.
  timeline.cookBusy.push({ start, end: activeEnd });

  if (resource === "oven") {
    timeline.ovenUsage.push({
      start,
      end,
      tempF: step.oven_temp_f ?? 0,
      rackSlots: step.rack_slots ?? 1,
    });
  } else if (resource === "stovetop") {
    timeline.activeBurners.push({ start, end });
  } else if (isSingletonAppliance(resource)) {
    timeline.singletonAppliances[resource].push({ start, end });
  }
  // resource === "none": no appliance footprint beyond the cook-busy window.
}

/**
 * Given an infeasible `candidate` instant, advance to the next instant at
 * which some resource frees up — the earliest end-time in `timeline`
 * strictly greater than `candidate`. Falls back to `candidate + 1` if no
 * timeline entry ends after `candidate` (should not occur in practice, since
 * `isFeasibleAt` only returns false when at least one window overlaps).
 */
export function nextCandidateTime(candidate: number, timeline: ResourceTimeline): number {
  const ends: number[] = [
    ...timeline.cookBusy.map((w) => w.end),
    ...timeline.ovenUsage.map((w) => w.end),
    ...timeline.activeBurners.map((w) => w.end),
    ...Object.values(timeline.singletonAppliances).flatMap((arr) => arr.map((w) => w.end)),
  ];
  const nextEnds = ends.filter((e) => e > candidate);
  return nextEnds.length > 0 ? Math.min(...nextEnds) : candidate + 1;
}
