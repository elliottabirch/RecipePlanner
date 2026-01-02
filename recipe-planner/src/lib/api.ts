import { pb } from './pocketbase';
import type { RecordModel } from 'pocketbase';

// Generic CRUD operations
export async function getAll<T extends RecordModel>(
    collection: string,
    options?: { expand?: string; sort?: string; filter?: string }
): Promise<T[]> {
    const records = await pb.collection(collection).getFullList<T>({
        expand: options?.expand,
        sort: options?.sort,
        filter: options?.filter,
    });
    return records;
}

export async function getOne<T extends RecordModel>(
    collection: string,
    id: string,
    options?: { expand?: string }
): Promise<T> {
    const record = await pb.collection(collection).getOne<T>(id, {
        expand: options?.expand,
    });
    return record;
}

export async function create<T extends RecordModel>(
    collection: string,
    data: Partial<T>
): Promise<T> {
    const record = await pb.collection(collection).create<T>(data);
    return record;
}

export async function update<T extends RecordModel>(
    collection: string,
    id: string,
    data: Partial<T>
): Promise<T> {
    const record = await pb.collection(collection).update<T>(id, data);
    return record;
}

export async function remove(collection: string, id: string): Promise<boolean> {
    await pb.collection(collection).delete(id);
    return true;
}

// Collection-specific helpers
export const collections = {
    stores: 'stores',
    sections: 'sections',
    containerTypes: 'container_types',
    tags: 'tags',
    products: 'products',
    recipes: 'recipes',
    recipeTags: 'recipe_tags',
    recipeProductNodes: 'recipe_product_nodes',
    recipeSteps: 'recipe_steps',
    productToStepEdges: 'product_to_step_edges',
    stepToProductEdges: 'step_to_product_edges',
    weeklyPlans: 'weekly_plans',
    plannedMeals: 'planned_meals',
} as const;