import { useState, useEffect, useCallback } from "react";
import { getAll, create, remove, collections } from "../lib/api";
import type { RecipeQueueItemExpanded } from "../lib/types";

export function useRecipeQueue() {
  const [queueItems, setQueueItems] = useState<RecipeQueueItemExpanded[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshQueue = useCallback(async () => {
    try {
      setLoading(true);
      const items = await getAll<RecipeQueueItemExpanded>(
        collections.recipeQueue,
        { expand: "recipe", sort: "sort_order,created" }
      );
      setQueueItems(items);
    } catch (err) {
      console.error("Failed to load recipe queue:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const isInQueue = useCallback(
    (recipeId: string) => {
      return queueItems.some((item) => item.recipe === recipeId);
    },
    [queueItems]
  );

  const addToQueue = useCallback(
    async (recipeId: string) => {
      if (isInQueue(recipeId)) return;
      const maxOrder = queueItems.reduce(
        (max, item) => Math.max(max, item.sort_order ?? 0),
        0
      );
      await create(collections.recipeQueue, {
        recipe: recipeId,
        sort_order: maxOrder + 1,
      });
      await refreshQueue();
    },
    [isInQueue, queueItems, refreshQueue]
  );

  const removeFromQueue = useCallback(
    async (queueItemId: string) => {
      await remove(collections.recipeQueue, queueItemId);
      await refreshQueue();
    },
    [refreshQueue]
  );

  const removeByRecipeId = useCallback(
    async (recipeId: string) => {
      const item = queueItems.find((i) => i.recipe === recipeId);
      if (item) {
        await remove(collections.recipeQueue, item.id);
        await refreshQueue();
      }
    },
    [queueItems, refreshQueue]
  );

  const clearQueue = useCallback(async () => {
    await Promise.all(
      queueItems.map((item) => remove(collections.recipeQueue, item.id))
    );
    await refreshQueue();
  }, [queueItems, refreshQueue]);

  return {
    queueItems,
    loading,
    addToQueue,
    removeFromQueue,
    removeByRecipeId,
    clearQueue,
    isInQueue,
    refreshQueue,
  };
}
