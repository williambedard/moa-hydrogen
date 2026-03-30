/**
 * Tests for buildSystemPrompt from ai-search-stream.server.ts
 *
 * Key behaviors under test:
 * 1. Prompt includes "ALWAYS SEARCH BEFORE RESPONDING" instruction
 * 2. Prompt includes get_product_details rule for product questions
 * 3. Prompt includes product context priority instructions
 * 4. Prompt includes multi-turn conversation instructions when hasHistory is true
 * 5. Prompt includes cart operations rules
 * 6. Prompt documents the concierge virtual tools
 * 7. Prompt includes context block and product block when provided
 */
import {describe, it, expect} from 'vitest';
import {buildSystemPrompt} from '~/lib/ai-search-stream.server';
import {formatProductContextForPrompt, type ProductContext} from '~/lib/product-context';

// ---------- Helpers ----------

function makeProductBlock(overrides: Partial<ProductContext> = {}): string {
  const ctx: ProductContext = {
    id: 'gid://shopify/Product/123',
    handle: 'classic-leather-loafers',
    title: 'Classic Leather Loafers',
    price: 'GBP 89.00',
    availableOptions: [
      {name: 'Size', values: ['6', '7', '8', '9']},
      {name: 'Color', values: ['Black', 'Brown']},
    ],
    ...overrides,
  };
  return formatProductContextForPrompt(ctx);
}

// ---------- Tests ----------

describe('buildSystemPrompt', () => {
  describe('RULE 1 — search first', () => {
    it('includes "ALWAYS SEARCH BEFORE RESPONDING" rule', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('ALWAYS SEARCH BEFORE RESPONDING');
    });

    it('instructs to always search before claiming store does not carry something', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('NEVER say "we don\'t carry that" without searching first');
    });
  });

  describe('RULE 2 — get_product_details for product questions', () => {
    it('instructs to MUST call get_product_details BEFORE answering ANY product question', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('MUST call get_product_details');
      expect(prompt).toContain('BEFORE answering ANY question about a product');
    });

    it('includes example questions that require get_product_details', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('What sizes/colours are available?');
      expect(prompt).toContain('Is this in stock in size 8?');
    });

    it('instructs not to answer product questions from context block alone', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('Do NOT answer product questions from the context block alone');
    });
  });

  describe('RULE 3 — product context priority', () => {
    it('explains current_product is the product user is actively viewing', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('<current_product>');
      expect(prompt).toContain('actively viewing');
    });

    it('explains last_viewed_product is for recently closed product', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('<last_viewed_product>');
      expect(prompt).toContain('recently closed');
    });

    it('instructs to ask for clarification when no product context', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('ask for clarification');
    });

    it('states context block overrides conversation history', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('ALWAYS overrides conversation history');
    });
  });

  describe('RULE 4 — cart operations', () => {
    it('includes cart operations section', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('CART OPERATIONS');
    });

    it('requires get_product_details before update_cart for adding items', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('get_product_details');
      expect(prompt).toContain('update_cart');
    });

    it('documents ADD, UPDATE, and REMOVE workflows', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('ADD item');
      expect(prompt).toContain('UPDATE quantity');
      expect(prompt).toContain('REMOVE item');
    });

    it('warns about claiming cart actions without calling tools', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('claim a cart action without calling update_cart');
    });

    it('instructs to never fabricate variant or line IDs', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('NEVER fabricate variant IDs or line IDs');
    });
  });

  describe('RULE 5 — concierge tools', () => {
    it('documents the _concierge_* virtual tools', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('_concierge_curate_content');
      expect(prompt).toContain('_concierge_generate_image');
      expect(prompt).toContain('_concierge_select_products');
      expect(prompt).toContain('_concierge_suggest_prompts');
      expect(prompt).toContain('_concierge_update_context');
      expect(prompt).toContain('_concierge_set_intent');
    });

    it('instructs that _concierge_set_intent must be the LAST tool called', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('MUST be the LAST tool called');
    });

    it('instructs to never mention concierge tools to the user', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('Never mention these to the user');
    });

    it('does not reference the old _concierge_set_curated_header tool', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).not.toContain('_concierge_set_curated_header');
    });

    it('instructs to call curate_content and generate_image after every search', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('After every product search');
      expect(prompt).toContain('_concierge_curate_content');
      expect(prompt).toContain('_concierge_generate_image');
    });
  });

  describe('multi-turn conversation', () => {
    it('includes MULTI-TURN section when hasHistory is true', () => {
      const prompt = buildSystemPrompt(true, '', '', '');
      expect(prompt).toContain('MULTI-TURN');
    });

    it('does not include MULTI-TURN section when hasHistory is false', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).not.toContain('MULTI-TURN');
    });
  });

  describe('context block inclusion', () => {
    it('includes shopping context block in the prompt', () => {
      const contextBlock =
        '\n<shopping_context>\nPreferences: colors=red,blue\n</shopping_context>';
      const prompt = buildSystemPrompt(false, contextBlock, '', '');
      expect(prompt).toContain('<shopping_context>');
      expect(prompt).toContain('colors=red,blue');
    });

    it('includes product block in the prompt', () => {
      const productBlock = makeProductBlock({handle: 'my-test-shoe'});
      const prompt = buildSystemPrompt(false, '', productBlock, '');
      expect(prompt).toContain('<current_product>');
      expect(prompt).toContain('my-test-shoe');
    });

    it('includes cart ID note in the prompt', () => {
      const cartIdNote =
        '\n\nCart ID for cart tools: gid://shopify/Cart/abc123';
      const prompt = buildSystemPrompt(false, '', '', cartIdNote);
      expect(prompt).toContain('gid://shopify/Cart/abc123');
    });
  });

  describe('style instructions', () => {
    it('instructs to be conversational', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('Be conversational');
    });

    it('instructs to never list products in text', () => {
      const prompt = buildSystemPrompt(false, '', '', '');
      expect(prompt).toContain('NEVER list products, prices, or product names in text');
    });
  });
});
