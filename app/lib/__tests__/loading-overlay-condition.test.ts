/**
 * Tests for the loading overlay display condition.
 *
 * The loading overlay should only appear when ALL of:
 *   1. isStreaming is true
 *   2. The user is NOT actively viewing a product detail (isActivelyViewingProduct = false)
 *   3. The search_shop_catalog tool has been called (hasSearchStarted = true)
 *
 * These conditions live in StreamingConversationPrompt in ($locale)._index.tsx.
 * We extract the pure logic here for thorough unit testing.
 */
import {describe, it, expect} from 'vitest';
import type {ProductContext} from '~/lib/product-context';
import type {ToolCallInfo} from '~/hooks/useStreamingChat';

// ---------- Pure condition logic (mirrors the route code) ----------

/**
 * Determines whether the loading overlay should be displayed.
 * This mirrors the logic in StreamingConversationPrompt:
 *
 *   const isActivelyViewingProduct = productContext && !productContext.isLastViewed;
 *   const showLoadingOverlay = isStreaming && !isActivelyViewingProduct && hasSearchStarted;
 */
function shouldShowLoadingOverlay(
  isStreaming: boolean,
  productContext: ProductContext | null,
  hasSearchStarted: boolean,
): boolean {
  const isActivelyViewingProduct = productContext != null && !productContext.isLastViewed;
  return isStreaming && !isActivelyViewingProduct && hasSearchStarted;
}

/**
 * Checks if any tool call in the list is search_shop_catalog.
 * Mirrors the useEffect in StreamingConversationPromptInner:
 *
 *   const hasSearch = state.toolCalls.some(tc => tc.tool === 'search_shop_catalog');
 */
function hasSearchToolStarted(toolCalls: ToolCallInfo[]): boolean {
  return toolCalls.some((tc) => tc.tool === 'search_shop_catalog');
}

// ---------- Test fixtures ----------

function makeProductContext(overrides: Partial<ProductContext> = {}): ProductContext {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'test-product',
    title: 'Test Product',
    price: '29.99',
    availableOptions: [],
    ...overrides,
  };
}

function makeToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tc-1',
    tool: 'search_shop_catalog',
    params: {query: 'shoes'},
    status: 'pending',
    ...overrides,
  };
}

// ---------- Tests ----------

describe('Loading overlay condition: shouldShowLoadingOverlay', () => {
  describe('general chat (no search tool)', () => {
    it('returns false when streaming but no search has started', () => {
      const result = shouldShowLoadingOverlay(
        true,   // isStreaming
        null,   // productContext
        false,  // hasSearchStarted
      );
      expect(result).toBe(false);
    });

    it('returns false when not streaming and no search', () => {
      const result = shouldShowLoadingOverlay(false, null, false);
      expect(result).toBe(false);
    });
  });

  describe('search_shop_catalog used', () => {
    it('returns true when streaming and search has started with no product context', () => {
      const result = shouldShowLoadingOverlay(
        true,   // isStreaming
        null,   // productContext
        true,   // hasSearchStarted
      );
      expect(result).toBe(true);
    });
  });

  describe('cart tool only (no search)', () => {
    it('returns false when streaming with cart tool but no search', () => {
      const result = shouldShowLoadingOverlay(
        true,   // isStreaming
        null,   // productContext
        false,  // hasSearchStarted (only cart tools, no search_shop_catalog)
      );
      expect(result).toBe(false);
    });
  });

  describe('product detail open + search tool', () => {
    it('returns false when actively viewing a product even if search started', () => {
      const productContext = makeProductContext({isLastViewed: false});
      const result = shouldShowLoadingOverlay(
        true,           // isStreaming
        productContext,  // actively viewing product (isLastViewed = false)
        true,           // hasSearchStarted
      );
      expect(result).toBe(false);
    });

    it('returns false when product context has isLastViewed undefined (treated as actively viewing)', () => {
      // isLastViewed defaults to undefined, which is falsy → treated as actively viewing
      const productContext = makeProductContext();
      delete (productContext as Record<string, unknown>).isLastViewed;
      const result = shouldShowLoadingOverlay(true, productContext, true);
      expect(result).toBe(false);
    });
  });

  describe('stream completes', () => {
    it('returns false when streaming stops regardless of search state', () => {
      const result = shouldShowLoadingOverlay(
        false,  // isStreaming = false (stream complete)
        null,
        true,   // hasSearchStarted still true (gets reset by useEffect in real code)
      );
      expect(result).toBe(false);
    });

    it('returns false when streaming stops even with product context', () => {
      const productContext = makeProductContext({isLastViewed: true});
      const result = shouldShowLoadingOverlay(false, productContext, true);
      expect(result).toBe(false);
    });
  });

  describe('last viewed product + search', () => {
    it('returns true when product is last-viewed (not actively viewing) and search started', () => {
      const productContext = makeProductContext({isLastViewed: true});
      const result = shouldShowLoadingOverlay(
        true,           // isStreaming
        productContext,  // isLastViewed = true → NOT actively viewing
        true,           // hasSearchStarted
      );
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns false when all conditions are false', () => {
      expect(shouldShowLoadingOverlay(false, null, false)).toBe(false);
    });

    it('returns false when only isStreaming is true', () => {
      expect(shouldShowLoadingOverlay(true, null, false)).toBe(false);
    });

    it('returns false when only hasSearchStarted is true', () => {
      expect(shouldShowLoadingOverlay(false, null, true)).toBe(false);
    });

    it('returns false when streaming and search but actively viewing product', () => {
      const productContext = makeProductContext({isLastViewed: false});
      expect(shouldShowLoadingOverlay(true, productContext, true)).toBe(false);
    });
  });
});

describe('hasSearchToolStarted', () => {
  it('returns false for empty tool calls', () => {
    expect(hasSearchToolStarted([])).toBe(false);
  });

  it('returns true when search_shop_catalog is in tool calls', () => {
    const toolCalls = [makeToolCall({tool: 'search_shop_catalog'})];
    expect(hasSearchToolStarted(toolCalls)).toBe(true);
  });

  it('returns false when only cart tools are present', () => {
    const toolCalls = [
      makeToolCall({id: 'tc-1', tool: 'add_to_cart', params: {variantId: 'v1'}}),
      makeToolCall({id: 'tc-2', tool: 'get_cart', params: {}}),
    ];
    expect(hasSearchToolStarted(toolCalls)).toBe(false);
  });

  it('returns false when only get_product_details is present', () => {
    const toolCalls = [
      makeToolCall({id: 'tc-1', tool: 'get_product_details', params: {handle: 'shirt'}}),
    ];
    expect(hasSearchToolStarted(toolCalls)).toBe(false);
  });

  it('returns true when search_shop_catalog is among multiple tools', () => {
    const toolCalls = [
      makeToolCall({id: 'tc-1', tool: 'get_product_details', params: {handle: 'shirt'}}),
      makeToolCall({id: 'tc-2', tool: 'search_shop_catalog', params: {query: 'blue dresses'}}),
      makeToolCall({id: 'tc-3', tool: 'add_to_cart', params: {variantId: 'v1'}}),
    ];
    expect(hasSearchToolStarted(toolCalls)).toBe(true);
  });

  it('returns true when search_shop_catalog is pending', () => {
    const toolCalls = [
      makeToolCall({tool: 'search_shop_catalog', status: 'pending'}),
    ];
    expect(hasSearchToolStarted(toolCalls)).toBe(true);
  });

  it('returns true when search_shop_catalog is complete', () => {
    const toolCalls = [
      makeToolCall({tool: 'search_shop_catalog', status: 'complete', result: '{"products":[]}'}),
    ];
    expect(hasSearchToolStarted(toolCalls)).toBe(true);
  });

  it('returns true when search_shop_catalog has errored', () => {
    const toolCalls = [
      makeToolCall({tool: 'search_shop_catalog', status: 'error'}),
    ];
    expect(hasSearchToolStarted(toolCalls)).toBe(true);
  });
});
