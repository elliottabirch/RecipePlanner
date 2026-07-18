import { describe, expect, it } from "vitest";
import {
  PREP_ACTION_KEYS,
  PREP_STATE_WORDS,
  isPrepAction,
  actionVerb,
  actionState,
  deriveStepLabel,
  derivePrepStateName,
} from "./prep-actions";

describe("prep-actions vocabulary", () => {
  it("exposes every action key and both grammatical forms", () => {
    expect(PREP_ACTION_KEYS).toContain("dice");
    expect(PREP_ACTION_KEYS).toContain("pull");
    expect(PREP_ACTION_KEYS).toContain("process");
    expect(actionVerb("dice")).toBe("dice");
    expect(actionState("dice")).toBe("diced");
    expect(actionVerb("process")).toBe("process");
    expect(actionState("process")).toBe("processed");
    expect(actionVerb("thin_slice")).toBe("thinly slice");
    expect(actionState("thin_slice")).toBe("thinly sliced");
  });

  it("keeps the six legacy state words (linter source) in PREP_STATE_WORDS", () => {
    for (const w of ["sliced", "diced", "minced", "chopped", "grated", "shredded"]) {
      expect(PREP_STATE_WORDS).toContain(w);
    }
  });

  it("isPrepAction rejects empty string and unknown values (PocketBase '' guard)", () => {
    expect(isPrepAction("dice")).toBe(true);
    expect(isPrepAction("")).toBe(false);
    expect(isPrepAction(undefined)).toBe(false);
    expect(isPrepAction("saute")).toBe(false);
  });
});

describe("deriveStepLabel — imperative step titles (hybrid model)", () => {
  it("derives '{verb} {input}' for a known action with a known input", () => {
    expect(
      deriveStepLabel({ name: "dice sweet potato", prep_action: "dice" }, "sweet potato")
    ).toBe("dice sweet potato");
  });

  it("is swap-aware: re-derives from the (swapped) input, fixing a stale name", () => {
    // Authored name still says "potatoes" but the input was swapped to potato.
    expect(
      deriveStepLabel({ name: "dice potatoes", prep_action: "dice" }, "potato (russet)")
    ).toBe("dice potato (russet)");
  });

  it("renders a pull as 'pull {input}'", () => {
    expect(
      deriveStepLabel(
        { name: "Pull out garlic cubes", prep_action: "pull" },
        "garlic cubes (frozen)"
      )
    ).toBe("pull garlic cubes (frozen)");
  });

  it("falls back to the authored name when there is no prep_action", () => {
    expect(
      deriveStepLabel({ name: "Melt butter, saute onion ~8 min", prep_action: "" }, "butter")
    ).toBe("Melt butter, saute onion ~8 min");
  });

  it("falls back to the authored name when the input is unknown", () => {
    expect(deriveStepLabel({ name: "dice onion", prep_action: "dice" })).toBe("dice onion");
    expect(deriveStepLabel({ name: "dice onion", prep_action: "dice" }, null)).toBe(
      "dice onion"
    );
  });

  it("falls back for an unknown/legacy action value", () => {
    expect(deriveStepLabel({ name: "sweat vegetables", prep_action: "sweat" }, "onion")).toBe(
      "sweat vegetables"
    );
  });
});

describe("derivePrepStateName — output product names (layer 2)", () => {
  it("derives '{state} {base}'", () => {
    expect(derivePrepStateName("onion (yellow)", "small_dice")).toBe(
      "small-diced onion (yellow)"
    );
    expect(derivePrepStateName("broccoli", "process")).toBe("processed broccoli");
  });

  it("returns null for an unknown action so callers keep the authored name", () => {
    expect(derivePrepStateName("onion", "")).toBeNull();
    expect(derivePrepStateName("onion", undefined)).toBeNull();
  });
});
