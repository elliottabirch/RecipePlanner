import type { Product } from "../../types";
import type {
  RecipeGraphData,
  ExpandedProductNode,
} from "../types";

// Re-import if needed from the aggregation types
// import type { RecipeGraphData, ExpandedProductNode } from "./types";

/**
 * Represents a single node replacement override
 */
export interface VariantOverride {
  originalNodeId: string; // recipe_product_node ID
  replacementProduct: Product; // full product object for the replacement
}

/**
 * Validation result for a single override
 */
export interface OverrideValidation {
  originalNodeId: string;
  isValid: boolean;
  originalNodeName?: string;
  replacementProductName: string;
  error?: string;
}

/**
 * Result of validating all overrides for a meal
 */
export interface OverrideValidationResult {
  valid: VariantOverride[];
  invalid: OverrideValidation[];
}

/**
 * Validates overrides against the current recipe graph.
 * Returns which overrides are valid (node still exists) and which are invalid.
 */
export function validateOverrides(
  recipeData: RecipeGraphData,
  overrides: VariantOverride[]
): OverrideValidationResult {
  const valid: VariantOverride[] = [];
  const invalid: OverrideValidation[] = [];

  for (const override of overrides) {
    const originalNode = recipeData.productNodes.find(
      (n) => n.id === override.originalNodeId
    );

    if (originalNode) {
      valid.push(override);
    } else {
      invalid.push({
        originalNodeId: override.originalNodeId,
        isValid: false,
        replacementProductName: override.replacementProduct.name,
        error: "Original node no longer exists in recipe",
      });
    }
  }

  return { valid, invalid };
}

/**
 * Finds all nodes that would be orphaned by removing the given node IDs.
 * A node is orphaned if it has no path to any terminal output (stored product or transient with no outgoing edges).
 * 
 * This walks backward from the replaced nodes to find upstream nodes that
 * no longer have any path to the rest of the graph.
 */
export function findOrphanedNodes(
  recipeData: RecipeGraphData,
  replacedNodeIds: Set<string>
): Set<string> {
  const orphaned = new Set<string>();
  
  // Build adjacency maps for traversal
  // stepToProductEdges: step -> product (step outputs)
  // productToStepEdges: product -> step (product feeds into step)
  
  const productToIncomingSteps = new Map<string, Set<string>>(); // product <- steps that output to it
  const stepToIncomingProducts = new Map<string, Set<string>>(); // step <- products that feed it
  const productToOutgoingSteps = new Map<string, Set<string>>(); // product -> steps it feeds
  const stepToOutgoingProducts = new Map<string, Set<string>>(); // step -> products it outputs
  
  // Initialize maps
  for (const node of recipeData.productNodes) {
    productToIncomingSteps.set(node.id, new Set());
    productToOutgoingSteps.set(node.id, new Set());
  }
  for (const step of recipeData.steps) {
    stepToIncomingProducts.set(step.id, new Set());
    stepToOutgoingProducts.set(step.id, new Set());
  }
  
  // Populate from edges
  for (const edge of recipeData.stepToProductEdges) {
    stepToOutgoingProducts.get(edge.source)?.add(edge.target);
    productToIncomingSteps.get(edge.target)?.add(edge.source);
  }
  for (const edge of recipeData.productToStepEdges) {
    productToOutgoingSteps.get(edge.source)?.add(edge.target);
    stepToIncomingProducts.get(edge.target)?.add(edge.source);
  }
  
  // Find all nodes that can reach a terminal output (not in replacedNodeIds)
  // Terminal outputs: product nodes with no outgoing edges to steps, excluding replaced nodes
  const reachesTerminal = new Set<string>();
  
  // Start from terminal product nodes (those not feeding any steps)
  const terminalProducts = recipeData.productNodes.filter(
    (n) => !replacedNodeIds.has(n.id) && (productToOutgoingSteps.get(n.id)?.size ?? 0) === 0
  );
  
  // BFS backward from terminals
  const queue: { type: "product" | "step"; id: string }[] = terminalProducts.map(
    (n) => ({ type: "product" as const, id: n.id })
  );
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.type}:${current.id}`;
    
    if (reachesTerminal.has(key)) continue;
    reachesTerminal.add(key);
    
    if (current.type === "product") {
      // Find steps that output this product
      const incomingSteps = productToIncomingSteps.get(current.id) ?? new Set();
      for (const stepId of incomingSteps) {
        queue.push({ type: "step", id: stepId });
      }
    } else {
      // Find products that feed this step
      const incomingProducts = stepToIncomingProducts.get(current.id) ?? new Set();
      for (const productNodeId of incomingProducts) {
        if (!replacedNodeIds.has(productNodeId)) {
          queue.push({ type: "product", id: productNodeId });
        }
      }
    }
  }
  
  // Any product node not in reachesTerminal (and not replaced) is orphaned
  for (const node of recipeData.productNodes) {
    if (!replacedNodeIds.has(node.id) && !reachesTerminal.has(`product:${node.id}`)) {
      orphaned.add(node.id);
    }
  }
  
  // Any step not in reachesTerminal is orphaned
  for (const step of recipeData.steps) {
    if (!reachesTerminal.has(`step:${step.id}`)) {
      orphaned.add(step.id);
    }
  }
  
  return orphaned;
}

/**
 * Applies variant overrides to a recipe graph, returning a new graph with:
 * 1. Replaced nodes swapped for new nodes pointing to replacement products
 * 2. Orphaned nodes removed
 * 3. Edges updated accordingly
 * 
 * The original recipeData is not mutated.
 */
export function applyVariantOverrides(
  recipeData: RecipeGraphData,
  overrides: VariantOverride[]
): RecipeGraphData {
  if (overrides.length === 0) {
    return recipeData;
  }
  
  // Validate first - only apply valid overrides
  const { valid } = validateOverrides(recipeData, overrides);
  
  if (valid.length === 0) {
    return recipeData;
  }
  
  // Build map of replacements
  const replacementMap = new Map<string, VariantOverride>();
  for (const override of valid) {
    replacementMap.set(override.originalNodeId, override);
  }
  
  const replacedNodeIds = new Set(replacementMap.keys());
  
  // Find orphaned nodes
  const orphanedIds = findOrphanedNodes(recipeData, replacedNodeIds);
  
  // Build new product nodes array
  const newProductNodes: ExpandedProductNode[] = [];
  
  for (const node of recipeData.productNodes) {
    if (replacedNodeIds.has(node.id)) {
      // Replace this node with a new one pointing to replacement product
      const override = replacementMap.get(node.id)!;
      const replacementNode: ExpandedProductNode = {
        ...node,
        // Keep the same ID so downstream edges still work
        product: override.replacementProduct.id,
        // Clear quantity/unit since this is a pre-existing item (e.g., from freezer)
        // The user may want to customize this - for now, preserve original
        expand: {
          product: {
            ...override.replacementProduct,
            expand: undefined, // Will need to be populated if needed
          },
        },
      };
      newProductNodes.push(replacementNode);
    } else if (!orphanedIds.has(node.id)) {
      // Keep this node as-is
      newProductNodes.push(node);
    }
    // Orphaned nodes are dropped
  }
  
  // Build new steps array (remove orphaned steps)
  const newSteps = recipeData.steps.filter((s) => !orphanedIds.has(s.id));
  
  // Build new edges (remove edges involving orphaned or replaced-upstream nodes)
  const newProductToStepEdges = recipeData.productToStepEdges.filter((edge) => {
    // Remove if source is orphaned
    if (orphanedIds.has(edge.source)) return false;
    // Remove if target step is orphaned
    if (orphanedIds.has(edge.target)) return false;
    // Remove if source is a replaced node (it no longer has upstream inputs)
    if (replacedNodeIds.has(edge.source)) return false;
    return true;
  });
  
  const newStepToProductEdges = recipeData.stepToProductEdges.filter((edge) => {
    // Remove if source step is orphaned
    if (orphanedIds.has(edge.source)) return false;
    // Remove if target product is orphaned
    if (orphanedIds.has(edge.target)) return false;
    // Remove if target is a replaced node (we're replacing what feeds it)
    if (replacedNodeIds.has(edge.target)) return false;
    return true;
  });
  
  return {
    recipe: recipeData.recipe,
    productNodes: newProductNodes,
    steps: newSteps,
    productToStepEdges: newProductToStepEdges,
    stepToProductEdges: newStepToProductEdges,
  };
}

/**
 * Computes a preview of what would be orphaned if a node is replaced.
 * Useful for UI to show user impact before confirming.
 */
export function previewOrphanedNodes(
  recipeData: RecipeGraphData,
  nodeIdToReplace: string
): {
  orphanedProducts: { id: string; name: string }[];
  orphanedSteps: { id: string; name: string }[];
} {
  const orphanedIds = findOrphanedNodes(recipeData, new Set([nodeIdToReplace]));
  
  const orphanedProducts = recipeData.productNodes
    .filter((n) => orphanedIds.has(n.id))
    .map((n) => ({
      id: n.id,
      name: n.expand?.product?.name ?? "Unknown",
    }));
  
  const orphanedSteps = recipeData.steps
    .filter((s) => orphanedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
    }));
  
  return { orphanedProducts, orphanedSteps };
}