/**
 * Tests for formatProductContextForPrompt from product-context.ts
 *
 * Key behaviors under test:
 * 1. Output includes instruction to call get_product_details for variant-level queries
 * 2. Output includes the product handle (so the AI knows what to pass to get_product_details)
 * 3. isLastViewed: true uses <last_viewed_product> tag
 * 4. isLastViewed: false uses <current_product> tag
 * 5. null input returns empty string
 */
import {describe, it, expect} from 'vitest';
import {
  formatProductContextForPrompt,
  type ProductContext,
} from '~/lib/product-context';

// ---------- Fixtures ----------

function makeProductContext(
  overrides: Partial<ProductContext> = {},
): ProductContext {
  return {
    id: 'gid://shopify/Product/123',
    handle: 'classic-leather-loafers',
    title: 'Classic Leather Loafers',
    vendor: 'Acme Shoes',
    price: 'GBP 89.00',
    availableOptions: [
      {name: 'Size', values: ['6', '7', '8', '9', '10']},
      {name: 'Color', values: ['Black', 'Brown', 'Tan']},
    ],
    ...overrides,
  };
}

// ---------- Tests ----------

describe('formatProductContextForPrompt', () => {
  describe('null / missing input', () => {
    it('returns empty string for null', () => {
      expect(formatProductContextForPrompt(null)).toBe('');
    });
  });

  describe('tag selection based on isLastViewed', () => {
    it('uses <current_product> tag when isLastViewed is false', () => {
      const ctx = makeProductContext({isLastViewed: false});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('<current_product>');
      expect(result).toContain('</current_product>');
      expect(result).not.toContain('<last_viewed_product>');
    });

    it('uses <current_product> tag when isLastViewed is undefined', () => {
      const ctx = makeProductContext();
      // isLastViewed is not set (undefined)
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('<current_product>');
      expect(result).toContain('</current_product>');
    });

    it('uses <last_viewed_product> tag when isLastViewed is true', () => {
      const ctx = makeProductContext({isLastViewed: true});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('<last_viewed_product>');
      expect(result).toContain('</last_viewed_product>');
      expect(result).not.toContain('<current_product>');
    });
  });

  describe('product handle inclusion', () => {
    it('includes the product handle in the output', () => {
      const ctx = makeProductContext({handle: 'classic-leather-loafers'});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('classic-leather-loafers');
    });

    it('includes Product handle label for the handle', () => {
      const ctx = makeProductContext({handle: 'my-test-handle'});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('Product handle: my-test-handle');
    });
  });

  describe('get_product_details instruction', () => {
    it('includes instruction to call get_product_details when a variant is selected', () => {
      const ctx = makeProductContext({
        selectedVariant: {
          id: 'gid://shopify/ProductVariant/456',
          title: 'Size 8 / Black',
          availableForSale: true,
        },
      });
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('get_product_details');
      expect(result).toContain('classic-leather-loafers');
    });

    it('includes instruction to call get_product_details for variant-level queries (not just cart ops)', () => {
      // This test verifies the fix: the instruction should mention calling
      // get_product_details generally, not only "to add this product to cart"
      const ctx = makeProductContext({
        selectedVariant: {
          id: 'gid://shopify/ProductVariant/456',
          title: 'Size 8 / Black',
          availableForSale: true,
        },
      });
      const result = formatProductContextForPrompt(ctx);

      // The instruction should reference calling get_product_details with the handle
      expect(result).toContain('get_product_details');
      expect(result).toContain(`handle "${ctx.handle}"`);
    });

    it('includes get_product_details note even without a selectedVariant', () => {
      // The note about calling get_product_details should always be present
      // for any product context, not only when a variant is selected.
      const ctx = makeProductContext();
      // No selectedVariant set
      const result = formatProductContextForPrompt(ctx);

      expect(result).toContain('get_product_details');
      expect(result).toContain(`handle "${ctx.handle}"`);
    });
  });

  describe('basic content', () => {
    it('includes product title and vendor', () => {
      const ctx = makeProductContext();
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('Classic Leather Loafers');
      expect(result).toContain('Acme Shoes');
    });

    it('includes price', () => {
      const ctx = makeProductContext({price: 'GBP 89.00'});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('GBP 89.00');
    });

    it('includes compare at price when present', () => {
      const ctx = makeProductContext({
        price: 'GBP 69.00',
        compareAtPrice: 'GBP 89.00',
      });
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('GBP 69.00');
      expect(result).toContain('was GBP 89.00');
    });

    it('includes available options', () => {
      const ctx = makeProductContext();
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('Available sizes: 6, 7, 8, 9, 10');
      expect(result).toContain('Available colors: Black, Brown, Tan');
    });

    it('includes product ID', () => {
      const ctx = makeProductContext({id: 'gid://shopify/Product/999'});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('Product ID: gid://shopify/Product/999');
    });
  });

  describe('selected variant', () => {
    it('shows selected variant info when present', () => {
      const ctx = makeProductContext({
        selectedVariant: {
          id: 'gid://shopify/ProductVariant/456',
          title: 'Size 8 / Black',
          availableForSale: true,
        },
      });
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('Currently selected variant: Size 8 / Black');
    });

    it('shows "Last selected" for last-viewed product', () => {
      const ctx = makeProductContext({
        isLastViewed: true,
        selectedVariant: {
          id: 'gid://shopify/ProductVariant/456',
          title: 'Size 8 / Black',
          availableForSale: true,
        },
      });
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('Last selected variant: Size 8 / Black');
    });

    it('marks out-of-stock variants', () => {
      const ctx = makeProductContext({
        selectedVariant: {
          id: 'gid://shopify/ProductVariant/456',
          title: 'Size 8 / Black',
          availableForSale: false,
        },
      });
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('(out of stock)');
    });
  });

  describe('viewing state text', () => {
    it('says "You are currently viewing" for active product', () => {
      const ctx = makeProductContext({isLastViewed: false});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('You are currently viewing: "Classic Leather Loafers"');
    });

    it('says "The user was recently viewing" for last-viewed product', () => {
      const ctx = makeProductContext({isLastViewed: true});
      const result = formatProductContextForPrompt(ctx);
      expect(result).toContain('The user was recently viewing: "Classic Leather Loafers"');
      expect(result).toContain('closed the product detail view');
    });
  });
});
