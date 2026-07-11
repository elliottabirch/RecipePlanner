import { useState, useEffect, useCallback } from "react";
import { getAll, create, update, collections } from "../lib/api";
import type { RecipeNote, RecipeNoteExpanded } from "../lib/types";

type SourceSurface = NonNullable<RecipeNote["source_surface"]>;

export function useRecipeNotes() {
  const [notes, setNotes] = useState<RecipeNoteExpanded[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const items = await getAll<RecipeNoteExpanded>(collections.recipeNotes, {
        expand: "recipe",
        sort: "-created",
      });
      setNotes(items);
    } catch (err) {
      console.error("Failed to load recipe notes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addNote = useCallback(
    async (recipeId: string, text: string, source_surface: SourceSurface) => {
      await create<RecipeNote>(collections.recipeNotes, {
        recipe: recipeId,
        text,
        status: "pending",
        source_surface,
      });
      await refresh();
    },
    [refresh]
  );

  const dismissNote = useCallback(
    async (id: string) => {
      await update<RecipeNote>(collections.recipeNotes, id, {
        status: "dismissed",
      });
      await refresh();
    },
    [refresh]
  );

  return { notes, loading, addNote, dismissNote, refresh };
}
