/**
 * Type definitions for shopping context persistence across AI conversations.
 */

export interface ShoppingPreferences {
  colors?: string[];
  sizes?: string[];
  budget?: {min?: number; max?: number; currency?: string};
  occasion?: string;
  style?: string[];
  categories?: string[];
  brands?: string[];
}

export interface CartContext {
  id: string;
}

export interface ShoppingContext {
  preferences: ShoppingPreferences;
  constraints: string[];
  rejectedProducts: string[];
  likedProducts?: string[];
  cart?: CartContext;
  lastUpdated: number;
}

export interface ContextUpdate {
  preferences?: Partial<ShoppingPreferences>;
  constraints?: string[];
  rejectedProducts?: string[];
  likedProducts?: string[];
}

/**
 * Creates an empty shopping context with defaults.
 */
export function createEmptyShoppingContext(): ShoppingContext {
  return {
    preferences: {},
    constraints: [],
    rejectedProducts: [],
    lastUpdated: Date.now(),
  };
}

/**
 * Merges a context update into an existing shopping context.
 * Deduplicates arrays and updates the lastUpdated timestamp.
 */
export function mergeContextUpdate(
  existing: ShoppingContext | null,
  update: ContextUpdate,
): ShoppingContext {
  const base = existing || createEmptyShoppingContext();

  const newPreferences: ShoppingPreferences = {...base.preferences};

  if (update.preferences) {
    // Merge array preferences with deduplication
    if (update.preferences.colors) {
      newPreferences.colors = dedupe([
        ...(newPreferences.colors || []),
        ...update.preferences.colors,
      ]);
    }
    if (update.preferences.sizes) {
      newPreferences.sizes = dedupe([
        ...(newPreferences.sizes || []),
        ...update.preferences.sizes,
      ]);
    }
    if (update.preferences.style) {
      newPreferences.style = dedupe([
        ...(newPreferences.style || []),
        ...update.preferences.style,
      ]);
    }
    if (update.preferences.categories) {
      newPreferences.categories = dedupe([
        ...(newPreferences.categories || []),
        ...update.preferences.categories,
      ]);
    }
    if (update.preferences.brands) {
      newPreferences.brands = dedupe([
        ...(newPreferences.brands || []),
        ...update.preferences.brands,
      ]);
    }
    // Scalar preferences replace existing values
    if (update.preferences.budget) {
      newPreferences.budget = {
        ...newPreferences.budget,
        ...update.preferences.budget,
      };
    }
    if (update.preferences.occasion) {
      newPreferences.occasion = update.preferences.occasion;
    }
  }

  return {
    preferences: newPreferences,
    constraints: dedupe([
      ...base.constraints,
      ...(update.constraints || []),
    ]),
    rejectedProducts: dedupe([
      ...base.rejectedProducts,
      ...(update.rejectedProducts || []),
    ]),
    likedProducts: dedupe([
      ...(base.likedProducts || []),
      ...(update.likedProducts || []),
    ]),
    cart: base.cart,
    lastUpdated: Date.now(),
  };
}

/**
 * Deduplicates an array while preserving order.
 */
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
