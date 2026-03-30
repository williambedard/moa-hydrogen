/**
 * Server-side utilities for shopping context processing.
 */

import type {
  ShoppingContext,
  CartContext,
  ContextUpdate,
} from './shopping-context';

const CONTEXT_UPDATE_START = '---CONTEXT_UPDATE---';
const CONTEXT_UPDATE_END = '---END_CONTEXT_UPDATE---';

/**
 * Formats shopping context into a compact system prompt section.
 */
export function formatContextForPrompt(
  context: ShoppingContext | null,
  cart: CartContext | null,
): string {
  if (!context && !cart) {
    return '';
  }

  const lines: string[] = [];

  if (context) {
    const prefParts: string[] = [];

    if (context.preferences.colors?.length) {
      prefParts.push(`colors=${context.preferences.colors.join(',')}`);
    }
    if (context.preferences.sizes?.length) {
      prefParts.push(`sizes=${context.preferences.sizes.join(',')}`);
    }
    if (context.preferences.budget) {
      const {min, max, currency} = context.preferences.budget;
      const budgetStr = max
        ? `under ${currency || '$'}${max}`
        : min
          ? `over ${currency || '$'}${min}`
          : '';
      if (budgetStr) prefParts.push(`budget=${budgetStr}`);
    }
    if (context.preferences.occasion) {
      prefParts.push(`occasion=${context.preferences.occasion}`);
    }
    if (context.preferences.style?.length) {
      prefParts.push(`style=${context.preferences.style.join(',')}`);
    }
    if (context.preferences.categories?.length) {
      prefParts.push(`categories=${context.preferences.categories.join(',')}`);
    }
    if (context.preferences.brands?.length) {
      prefParts.push(`brands=${context.preferences.brands.join(',')}`);
    }

    if (prefParts.length > 0) {
      lines.push(`Preferences: ${prefParts.join(' | ')}`);
    }

    if (context.constraints.length > 0) {
      lines.push(`Constraints: ${context.constraints.join(', ')}`);
    }

    if (context.rejectedProducts.length > 0) {
      lines.push(`Rejected products: ${context.rejectedProducts.join(', ')}`);
    }

    if (context.likedProducts && context.likedProducts.length > 0) {
      lines.push(`Liked products: ${context.likedProducts.join(', ')}`);
    }
  }

  // NOTE: Cart details are intentionally excluded from <shopping_context>.
  // Claude must always call "get_cart" to retrieve live cart data rather than
  // relying on a potentially stale summary here.

  if (lines.length === 0) {
    return '';
  }

  return `
<shopping_context>
${lines.join('\n')}
</shopping_context>`;
}

/**
 * Parses context update markers from AI response text.
 * @deprecated Used only by the legacy non-streaming endpoint (ai-search.server.ts).
 * The streaming endpoint uses virtual tools instead.
 */
export function parseContextUpdate(responseText: string): {
  cleanedText: string;
  update: ContextUpdate | null;
} {
  const startIdx = responseText.indexOf(CONTEXT_UPDATE_START);
  const endIdx = responseText.indexOf(CONTEXT_UPDATE_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return {cleanedText: responseText, update: null};
  }

  const jsonStr = responseText
    .substring(startIdx + CONTEXT_UPDATE_START.length, endIdx)
    .trim();

  let update: ContextUpdate | null = null;
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      update = {};
      if (parsed.preferences && typeof parsed.preferences === 'object') {
        update.preferences = parsed.preferences as ContextUpdate['preferences'];
      }
      if (Array.isArray(parsed.constraints)) {
        update.constraints = (parsed.constraints as unknown[]).filter(
          (c): c is string => typeof c === 'string',
        );
      }
      if (Array.isArray(parsed.rejectedProducts)) {
        update.rejectedProducts = (parsed.rejectedProducts as unknown[]).filter(
          (p): p is string => typeof p === 'string',
        );
      }
      if (Array.isArray(parsed.likedProducts)) {
        update.likedProducts = (parsed.likedProducts as unknown[]).filter(
          (p): p is string => typeof p === 'string',
        );
      }
    }
  } catch {
    console.warn('[Shopping Context] Failed to parse context update JSON');
  }

  const cleanedText =
    responseText.substring(0, startIdx).trim() +
    ' ' +
    responseText.substring(endIdx + CONTEXT_UPDATE_END.length).trim();

  return {
    cleanedText: cleanedText.trim(),
    update,
  };
}

/**
 * Builds CartContext from Hydrogen cart data.
 * Only extracts the cart ID — Claude must always call get_cart for live contents.
 */
export function buildCartContext(
  cartData: {id: string} | null | undefined,
): CartContext | null {
  if (!cartData || !cartData.id) {
    return null;
  }

  return {id: cartData.id};
}
