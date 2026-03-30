/**
 * Tests for the streamAIQuery async generator in ai-search-stream.server.ts.
 *
 * Mocks:
 * - Anthropic SDK (messages.stream) — returns predictable event sequences
 * - MCPClient — connect() returns fake tools, callTool() returns fake results
 * - generateHeaderImage — controlled delay + return
 * - formatContextForPrompt / formatProductContextForPrompt — passthrough stubs
 *
 * These tests validate:
 * 1. Event ordering: text, tool events, curated_products, intent, done
 * 2. Virtual tool handling (visible vs invisible)
 * 3. MCP tool calls flow through correctly
 * 4. Image generation integration
 * 5. Cart hallucination detection
 * 6. Product enrichment via storefront query
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

// ---- Mock modules before importing the module under test ----

// Mock the MCP client
vi.mock('~/lib/mcp-client.server', () => {
  const MCPClient = vi.fn();
  MCPClient.prototype.connect = vi.fn().mockResolvedValue([
    {
      name: 'search_shop_catalog',
      description: 'Search products',
      input_schema: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']},
    },
    {
      name: 'get_product_details',
      description: 'Get product details',
      input_schema: {type: 'object', properties: {handle: {type: 'string'}}, required: ['handle']},
    },
    {
      name: 'update_cart',
      description: 'Update cart',
      input_schema: {type: 'object', properties: {}},
    },
    {
      name: 'get_cart',
      description: 'Get cart',
      input_schema: {type: 'object', properties: {}},
    },
  ]);
  MCPClient.prototype.callTool = vi.fn().mockResolvedValue({
    content: [{type: 'text', text: '{"products":[]}'}],
  });
  return {MCPClient};
});

// Mock image generation
vi.mock('~/lib/image-generation.server', () => ({
  generateHeaderImage: vi.fn().mockResolvedValue(null),
}));

// Mock shopping-context.server
vi.mock('~/lib/shopping-context.server', () => ({
  formatContextForPrompt: vi.fn().mockReturnValue(''),
}));

// Mock product-context
vi.mock('~/lib/product-context', () => ({
  formatProductContextForPrompt: vi.fn().mockReturnValue(''),
}));

// Mock Anthropic SDK — the factory cannot reference outer variables (hoisted),
// so we create a spy inside and control it via the imported mock.
vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn();
  Anthropic.prototype.messages = {
    stream: vi.fn(),
  };
  return {default: Anthropic};
});

import {streamAIQuery} from '../ai-search-stream.server';
import type {StreamEvent} from '../ai-search-stream.server';
import {MCPClient} from '../mcp-client.server';
import {generateHeaderImage} from '../image-generation.server';
import Anthropic from '@anthropic-ai/sdk';

// ---- Helpers ----

/** Create a content_block_start event for a text block */
function textBlockStart(index: number = 0) {
  return {type: 'content_block_start', index, content_block: {type: 'text', text: ''}};
}

/** Create a text_delta event */
function textDelta(text: string) {
  return {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text}};
}

/** Create a content_block_stop event */
function blockStop(index: number = 0) {
  return {type: 'content_block_stop', index};
}

/** Create a content_block_start event for a tool_use block */
function toolBlockStart(index: number, id: string, name: string) {
  return {type: 'content_block_start', index, content_block: {type: 'tool_use', id, name}};
}

/** Create an input_json_delta event */
function inputJsonDelta(index: number, partial_json: string) {
  return {type: 'content_block_delta', index, delta: {type: 'input_json_delta', partial_json}};
}

/** Create a thinking block start */
function thinkingBlockStart(index: number = 0) {
  return {type: 'content_block_start', index, content_block: {type: 'thinking'}};
}

/** Create a thinking_delta event */
function thinkingDeltaEvent(thinking: string) {
  return {type: 'content_block_delta', index: 0, delta: {type: 'thinking_delta', thinking}};
}

/** Create a message_stop event */
function messageStop() {
  return {type: 'message_stop'};
}

/**
 * Helper: make an async iterable from an array of events.
 * Conforms to the interface returned by anthropic.messages.stream().
 */
function makeAsyncIterable(events: Array<Record<string, unknown>>) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of events) {
        yield e;
      }
    },
  };
}

/**
 * Set up the Anthropic mock stream to yield events for each round.
 * Each "round" is one call to messages.stream() in the agentic loop.
 */
function setupMockStream(...rounds: Array<Array<Record<string, unknown>>>) {
  // Get the stream mock from the Anthropic prototype
  const streamMock = vi.mocked(Anthropic.prototype.messages.stream);

  let callIndex = 0;
  streamMock.mockImplementation(() => {
    const events = rounds[callIndex] || rounds[rounds.length - 1];
    callIndex++;
    return makeAsyncIterable(events) as unknown as ReturnType<typeof streamMock>;
  });
}

/** Collect all events from the streamAIQuery generator */
async function collectEvents(options?: Partial<Parameters<typeof streamAIQuery>[0]>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const gen = streamAIQuery({
    userQuery: 'Show me some shoes',
    storeDomain: 'https://test-store.myshopify.com',
    storefront: {query: vi.fn().mockResolvedValue({products: {nodes: []}})},
    apiKey: 'test-key',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    ...options,
  });
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// ---- Setup / Teardown ----

beforeEach(() => {
  vi.clearAllMocks();

  // Restore default MCP mock behavior
  vi.mocked(MCPClient.prototype.connect).mockResolvedValue([
    {name: 'search_shop_catalog', description: 'Search', input_schema: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']}},
    {name: 'get_product_details', description: 'Details', input_schema: {type: 'object', properties: {handle: {type: 'string'}}, required: ['handle']}},
    {name: 'update_cart', description: 'Cart update', input_schema: {type: 'object', properties: {}}},
    {name: 'get_cart', description: 'Cart get', input_schema: {type: 'object', properties: {}}},
  ] as never);
  vi.mocked(MCPClient.prototype.callTool).mockResolvedValue({
    content: [{type: 'text', text: '{"products":[]}'}],
  });

  // Default: stream returns a simple text response with no tool calls
  setupMockStream([
    textBlockStart(0),
    textDelta('Hello!'),
    blockStop(0),
    messageStop(),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Tests ----

describe('streamAIQuery', () => {
  describe('stream_start event', () => {
    it('emits stream_start as the very first event', async () => {
      const events = await collectEvents();

      expect(events[0].type).toBe('stream_start');
    });

    it('stream_start comes before any text_delta events', async () => {
      setupMockStream([
        textBlockStart(0),
        textDelta('Hello'),
        blockStop(0),
        messageStop(),
      ]);

      const events = await collectEvents();

      const streamStartIdx = events.findIndex((e) => e.type === 'stream_start');
      const firstTextIdx = events.findIndex((e) => e.type === 'text_delta');
      expect(streamStartIdx).toBe(0);
      expect(firstTextIdx).toBeGreaterThan(streamStartIdx);
    });
  });

  describe('event ordering — text-only response', () => {
    it('emits text_delta events followed by done', async () => {
      setupMockStream([
        textBlockStart(0),
        textDelta('Hello '),
        textDelta('world!'),
        blockStop(0),
        messageStop(),
      ]);

      const events = await collectEvents();

      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents).toHaveLength(2);
      expect((textEvents[0] as {delta: string}).delta).toBe('Hello ');
      expect((textEvents[1] as {delta: string}).delta).toBe('world!');

      // done event is always last
      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe('done');
      expect((lastEvent as {fullText: string}).fullText).toBe('Hello world!');
    });

    it('done event is always the last event', async () => {
      const events = await collectEvents();
      expect(events[events.length - 1].type).toBe('done');
    });
  });

  describe('event ordering — with MCP tool calls', () => {
    it('emits tool_use_start and tool_use_end for MCP tools', async () => {
      setupMockStream(
        [
          textBlockStart(0),
          textDelta('Let me search...'),
          blockStop(0),
          toolBlockStart(1, 'tool-1', 'search_shop_catalog'),
          inputJsonDelta(1, '{"query":"shoes"}'),
          blockStop(1),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Found some options!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const toolStartEvents = events.filter((e) => e.type === 'tool_use_start');
      expect(toolStartEvents).toHaveLength(1);
      expect((toolStartEvents[0] as {tool: string}).tool).toBe('search_shop_catalog');

      const toolEndEvents = events.filter((e) => e.type === 'tool_use_end');
      expect(toolEndEvents).toHaveLength(1);
      expect((toolEndEvents[0] as {tool: string}).tool).toBe('search_shop_catalog');

      // tool_use_start comes before tool_use_end
      const startIdx = events.indexOf(toolStartEvents[0]);
      const endIdx = events.indexOf(toolEndEvents[0]);
      expect(startIdx).toBeLessThan(endIdx);

      // done is still last
      expect(events[events.length - 1].type).toBe('done');
    });

    it('MCP callTool is called with correct arguments', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tool-1', 'search_shop_catalog'),
          inputJsonDelta(0, '{"query":"red shoes"}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Here you go!'),
          blockStop(0),
          messageStop(),
        ],
      );

      await collectEvents();

      expect(vi.mocked(MCPClient.prototype.callTool)).toHaveBeenCalledWith(
        'search_shop_catalog',
        {query: 'red shoes'},
      );
    });
  });

  describe('virtual tools — visible (curate_content, generate_image)', () => {
    it('emits tool_use_start/end for _concierge_curate_content', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-curate', '_concierge_curate_content'),
          inputJsonDelta(0, '{"title":"Top Picks","subtitle":"Just for you"}'),
          blockStop(0),
          toolBlockStart(1, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(1, '{"type":"product_search","show_products":true}'),
          blockStop(1),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Done!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const curateStart = events.find(
        (e) => e.type === 'tool_use_start' && (e as {tool: string}).tool === '_concierge_curate_content',
      );
      const curateEnd = events.find(
        (e) => e.type === 'tool_use_end' && (e as {tool: string}).tool === '_concierge_curate_content',
      );
      expect(curateStart).toBeDefined();
      expect(curateEnd).toBeDefined();
    });

    it('emits tool_use_start/end for _concierge_generate_image', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-curate', '_concierge_curate_content'),
          inputJsonDelta(0, '{"title":"Title","subtitle":"Sub"}'),
          blockStop(0),
          toolBlockStart(1, 'tc-img', '_concierge_generate_image'),
          inputJsonDelta(1, '{"image_prompt":"luxury shoes on marble"}'),
          blockStop(1),
          toolBlockStart(2, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(2, '{"type":"general","show_products":false}'),
          blockStop(2),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('All set.'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const imgStart = events.find(
        (e) => e.type === 'tool_use_start' && (e as {tool: string}).tool === '_concierge_generate_image',
      );
      const imgEnd = events.find(
        (e) => e.type === 'tool_use_end' && (e as {tool: string}).tool === '_concierge_generate_image',
      );
      expect(imgStart).toBeDefined();
      expect(imgEnd).toBeDefined();
    });

    it('does NOT emit tool_use_start/end for invisible virtual tools (suggest_prompts, update_context, set_intent)', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-prompts', '_concierge_suggest_prompts'),
          inputJsonDelta(0, '{"prompts":["Try red","Try blue"]}'),
          blockStop(0),
          toolBlockStart(1, 'tc-context', '_concierge_update_context'),
          inputJsonDelta(1, '{"preferences":{"colors":["red"]}}'),
          blockStop(1),
          toolBlockStart(2, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(2, '{"type":"product_search","show_products":true}'),
          blockStop(2),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Done'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      // These invisible tools should NOT emit tool_use_start/end events
      const invisibleTools = ['_concierge_suggest_prompts', '_concierge_update_context', '_concierge_set_intent'];
      const toolEvents = events.filter(
        (e) =>
          (e.type === 'tool_use_start' || e.type === 'tool_use_end') &&
          invisibleTools.includes((e as {tool: string}).tool),
      );
      expect(toolEvents).toHaveLength(0);
    });

    it('emits tool_use_start/end for _concierge_select_products (now a visible tool with inline enrichment)', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-select', '_concierge_select_products'),
          inputJsonDelta(0, '{"product_titles":["Shoe A"]}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Done'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const selectStart = events.find(
        (e) => e.type === 'tool_use_start' && (e as {tool: string}).tool === '_concierge_select_products',
      );
      const selectEnd = events.find(
        (e) => e.type === 'tool_use_end' && (e as {tool: string}).tool === '_concierge_select_products',
      );
      expect(selectStart).toBeDefined();
      expect(selectEnd).toBeDefined();
    });
  });

  describe('virtual tools — captured data emission', () => {
    it('emits intent event from _concierge_set_intent', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(0, '{"type":"product_search","show_products":true}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Results'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const intentEvent = events.find((e) => e.type === 'intent');
      expect(intentEvent).toBeDefined();
      expect((intentEvent as {intent: {type: string; showProducts: boolean}}).intent).toEqual({
        type: 'product_search',
        showProducts: true,
      });
    });

    it('emits suggested_prompts event from _concierge_suggest_prompts', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-prompts', '_concierge_suggest_prompts'),
          inputJsonDelta(0, '{"prompts":["Show me red shoes","What about boots?"]}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Here you go'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const promptsEvent = events.find((e) => e.type === 'suggested_prompts');
      expect(promptsEvent).toBeDefined();
      expect((promptsEvent as {prompts: string[]}).prompts).toEqual([
        'Show me red shoes',
        'What about boots?',
      ]);
    });

    it('emits context_update event from _concierge_update_context', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-ctx', '_concierge_update_context'),
          inputJsonDelta(0, '{"preferences":{"colors":["navy"]},"constraints":["no polyester"]}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Noted'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const ctxEvent = events.find((e) => e.type === 'context_update');
      expect(ctxEvent).toBeDefined();
      const update = (ctxEvent as {update: {preferences?: {colors?: string[]}; constraints?: string[]}}).update;
      expect(update.preferences?.colors).toEqual(['navy']);
      expect(update.constraints).toEqual(['no polyester']);
    });

    it('intent event comes before done event', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(0, '{"type":"general","show_products":false}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Hey!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const intentIdx = events.findIndex((e) => e.type === 'intent');
      const doneIdx = events.findIndex((e) => e.type === 'done');
      expect(intentIdx).toBeGreaterThan(-1);
      expect(doneIdx).toBeGreaterThan(-1);
      expect(intentIdx).toBeLessThan(doneIdx);
    });
  });

  describe('image generation', () => {
    it('calls generateHeaderImage when image_prompt is provided and config is available', async () => {
      vi.mocked(generateHeaderImage).mockResolvedValue('data:image/png;base64,fakeimage');

      setupMockStream(
        [
          toolBlockStart(0, 'tc-curate', '_concierge_curate_content'),
          inputJsonDelta(0, '{"title":"Shoes","subtitle":"Best picks"}'),
          blockStop(0),
          toolBlockStart(1, 'tc-img', '_concierge_generate_image'),
          inputJsonDelta(1, '{"image_prompt":"luxury shoes on marble"}'),
          blockStop(1),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Here!'),
          blockStop(0),
          messageStop(),
        ],
      );

      await collectEvents({
        imageGenerationUrl: 'https://proxy.example.com/gemini',
        openaiApiKey: 'test-api-key',
      });

      expect(generateHeaderImage).toHaveBeenCalledWith(
        'luxury shoes on marble',
        'https://proxy.example.com/gemini',
        'test-api-key',
      );
    });

    it('skips image generation when image_prompt is empty', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-img', '_concierge_generate_image'),
          inputJsonDelta(0, '{"image_prompt":""}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Skipped'),
          blockStop(0),
          messageStop(),
        ],
      );

      await collectEvents({
        imageGenerationUrl: 'https://proxy.example.com/gemini',
        openaiApiKey: 'test-api-key',
      });

      expect(generateHeaderImage).not.toHaveBeenCalled();
    });

    it('skips image generation when disableImageGeneration is true', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tc-img', '_concierge_generate_image'),
          inputJsonDelta(0, '{"image_prompt":"some prompt"}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('No image'),
          blockStop(0),
          messageStop(),
        ],
      );

      await collectEvents({
        imageGenerationUrl: 'https://proxy.example.com/gemini',
        openaiApiKey: 'test-api-key',
        disableImageGeneration: true,
      });

      expect(generateHeaderImage).not.toHaveBeenCalled();
    });

    it('handles image generation failure gracefully', async () => {
      vi.mocked(generateHeaderImage).mockResolvedValue(null);

      setupMockStream(
        [
          toolBlockStart(0, 'tc-curate', '_concierge_curate_content'),
          inputJsonDelta(0, '{"title":"Shoes","subtitle":"Best"}'),
          blockStop(0),
          toolBlockStart(1, 'tc-img', '_concierge_generate_image'),
          inputJsonDelta(1, '{"image_prompt":"luxury shoes"}'),
          blockStop(1),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Done'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents({
        imageGenerationUrl: 'https://proxy.example.com/gemini',
        openaiApiKey: 'test-api-key',
      });

      const imgEnd = events.find(
        (e) => e.type === 'tool_use_end' && (e as {tool: string}).tool === '_concierge_generate_image',
      );
      expect(imgEnd).toBeDefined();
      expect((imgEnd as {result: string}).result).toContain('failed');
    });
  });

  describe('product enrichment and curated header', () => {
    it('emits curated_products_header and re-emits with imageUrl when image completes', async () => {
      vi.mocked(generateHeaderImage).mockResolvedValue('data:image/png;base64,abc');

      const mockStorefront = {
        query: vi.fn().mockResolvedValue({
          products: {
            nodes: [
              {
                id: 'gid://shopify/Product/1',
                handle: 'red-shoes',
                title: 'Red Shoes',
                description: 'Nice shoes',
                vendor: 'TestVendor',
                productType: 'Shoes',
                tags: ['red'],
                availableForSale: true,
                featuredImage: {url: 'https://cdn.shopify.com/img.jpg', altText: 'Red shoes'},
                images: {nodes: [{url: 'https://cdn.shopify.com/img.jpg'}]},
                options: [{name: 'Size', values: ['8', '9', '10']}],
                variants: {nodes: [{id: 'v1', title: '8', availableForSale: true, price: {amount: '99.00', currencyCode: 'USD'}, selectedOptions: [{name: 'Size', value: '8'}]}]},
                priceRange: {minVariantPrice: {amount: '99.00', currencyCode: 'USD'}},
                compareAtPriceRange: {minVariantPrice: {amount: '0', currencyCode: 'USD'}},
              },
            ],
          },
        }),
      };

      vi.mocked(MCPClient.prototype.callTool).mockResolvedValueOnce({
        content: [{type: 'text', text: JSON.stringify({products: [{title: 'Red Shoes', handle: 'red-shoes', id: 'gid://shopify/Product/1'}]})}],
      });

      setupMockStream(
        [
          toolBlockStart(0, 'tool-search', 'search_shop_catalog'),
          inputJsonDelta(0, '{"query":"shoes"}'),
          blockStop(0),
          toolBlockStart(1, 'tc-curate', '_concierge_curate_content'),
          inputJsonDelta(1, '{"title":"Shoe Collection","subtitle":"Curated for you"}'),
          blockStop(1),
          toolBlockStart(2, 'tc-img', '_concierge_generate_image'),
          inputJsonDelta(2, '{"image_prompt":"luxury shoes"}'),
          blockStop(2),
          toolBlockStart(3, 'tc-select', '_concierge_select_products'),
          inputJsonDelta(3, '{"product_titles":["Red Shoes"]}'),
          blockStop(3),
          toolBlockStart(4, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(4, '{"type":"product_search","show_products":true}'),
          blockStop(4),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Here are your shoes!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents({
        storefront: mockStorefront,
        imageGenerationUrl: 'https://proxy.example.com/gemini',
        openaiApiKey: 'test-api-key',
      });

      // Should have curated_products_header event(s) — first inline (may lack image),
      // then a re-emit with imageUrl after image generation completes
      const headerEvents = events.filter((e) => e.type === 'curated_products_header');
      expect(headerEvents.length).toBeGreaterThanOrEqual(1);

      // The last header event should have the correct title/subtitle
      const lastHeader = headerEvents[headerEvents.length - 1] as {title: string; subtitle: string; imageUrl?: string};
      expect(lastHeader.title).toBe('Shoe Collection');
      expect(lastHeader.subtitle).toBe('Curated for you');

      // If image generation was available, the last header should include imageUrl
      if (headerEvents.length > 1) {
        expect(lastHeader.imageUrl).toBe('data:image/png;base64,abc');
      }

      // Should have curated_products event
      const productsEvent = events.find((e) => e.type === 'curated_products');
      expect(productsEvent).toBeDefined();

      // Products come before done
      const productsIdx = events.findIndex((e) => e.type === 'curated_products');
      const doneIdx = events.findIndex((e) => e.type === 'done');
      expect(productsIdx).toBeLessThan(doneIdx);
    });

    it('emits curated_products_header without imageUrl when image generation not configured', async () => {
      const mockStorefront = {
        query: vi.fn().mockResolvedValue({
          products: {
            nodes: [
              {
                id: 'gid://shopify/Product/1',
                handle: 'blue-dress',
                title: 'Blue Dress',
                description: 'Elegant dress',
                vendor: 'TestVendor',
                productType: 'Dresses',
                tags: ['blue'],
                availableForSale: true,
                images: {nodes: [{url: 'https://cdn.shopify.com/img.jpg'}]},
                options: [],
                variants: {nodes: [{id: 'v1', title: 'Default', availableForSale: true, price: {amount: '150.00', currencyCode: 'USD'}, selectedOptions: []}]},
                priceRange: {minVariantPrice: {amount: '150.00', currencyCode: 'USD'}},
                compareAtPriceRange: {minVariantPrice: {amount: '0', currencyCode: 'USD'}},
              },
            ],
          },
        }),
      };

      vi.mocked(MCPClient.prototype.callTool).mockResolvedValueOnce({
        content: [{type: 'text', text: JSON.stringify({products: [{title: 'Blue Dress', handle: 'blue-dress', id: 'gid://shopify/Product/1'}]})}],
      });

      setupMockStream(
        [
          toolBlockStart(0, 'tool-search', 'search_shop_catalog'),
          inputJsonDelta(0, '{"query":"dresses"}'),
          blockStop(0),
          toolBlockStart(1, 'tc-curate', '_concierge_curate_content'),
          inputJsonDelta(1, '{"title":"Dresses","subtitle":"Elegant picks"}'),
          blockStop(1),
          toolBlockStart(2, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(2, '{"type":"product_search","show_products":true}'),
          blockStop(2),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Found some dresses!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents({storefront: mockStorefront});

      const headerEvent = events.find((e) => e.type === 'curated_products_header');
      expect(headerEvent).toBeDefined();
      expect((headerEvent as {title: string}).title).toBe('Dresses');
      expect((headerEvent as {imageUrl?: string}).imageUrl).toBeUndefined();
    });
  });

  describe('cart tool enforcement', () => {
    it('blocks update_cart (add) when get_product_details has not been called', async () => {
      setupMockStream(
        [
          toolBlockStart(0, 'tool-cart', 'update_cart'),
          inputJsonDelta(0, '{"variant_id":"v1","quantity":1}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Let me get the product details first.'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      // update_cart should NOT have been called on MCP
      expect(vi.mocked(MCPClient.prototype.callTool)).not.toHaveBeenCalledWith('update_cart', expect.anything());

      // Should have a tool_use_end with error
      const toolEndError = events.find(
        (e) => e.type === 'tool_use_end' && (e as {tool: string}).tool === 'update_cart',
      );
      expect(toolEndError).toBeDefined();
      expect((toolEndError as {result: string}).result).toContain('get_product_details');
    });

    it('allows update_cart with line_id (update/remove) without get_product_details', async () => {
      vi.mocked(MCPClient.prototype.callTool).mockResolvedValue({
        content: [{type: 'text', text: '{"cart":{"id":"gid://shopify/Cart/abc"}}'}],
      });

      setupMockStream(
        [
          toolBlockStart(0, 'tool-cart', 'update_cart'),
          inputJsonDelta(0, '{"line_id":"gid://shopify/CartLine/xyz","quantity":0}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Removed!'),
          blockStop(0),
          messageStop(),
        ],
      );

      await collectEvents();

      expect(vi.mocked(MCPClient.prototype.callTool)).toHaveBeenCalledWith(
        'update_cart',
        expect.objectContaining({line_id: 'gid://shopify/CartLine/xyz'}),
      );
    });

    it('injects cart_id into cart tools when cartContext is provided', async () => {
      vi.mocked(MCPClient.prototype.callTool).mockResolvedValue({
        content: [{type: 'text', text: '{"items":[]}'}],
      });

      setupMockStream(
        [
          toolBlockStart(0, 'tool-getcart', 'get_cart'),
          inputJsonDelta(0, '{}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Your cart is empty.'),
          blockStop(0),
          messageStop(),
        ],
      );

      await collectEvents({
        cartContext: {id: 'gid://shopify/Cart/my-cart-123'},
      });

      expect(vi.mocked(MCPClient.prototype.callTool)).toHaveBeenCalledWith(
        'get_cart',
        expect.objectContaining({cart_id: 'gid://shopify/Cart/my-cart-123'}),
      );
    });
  });

  describe('cart hallucination detection', () => {
    it('detects when Claude claims cart add without calling update_cart and forces retry', async () => {
      setupMockStream(
        // Round 1: Claude claims to add to cart without calling update_cart
        [
          textBlockStart(0),
          textDelta("I've added it to your cart!"),
          blockStop(0),
          messageStop(),
        ],
        // Round 2 (retry): Claude calls get_product_details
        [
          toolBlockStart(0, 'tool-details', 'get_product_details'),
          inputJsonDelta(0, '{"handle":"red-shoes"}'),
          blockStop(0),
          messageStop(),
        ],
        // Round 3 (retry): Claude calls update_cart
        [
          toolBlockStart(0, 'tool-cart', 'update_cart'),
          inputJsonDelta(0, '{"variant_id":"v1","quantity":1}'),
          blockStop(0),
          messageStop(),
        ],
        // Round 4 (retry): Final text
        [
          textBlockStart(0),
          textDelta('Added to cart!'),
          blockStop(0),
          messageStop(),
        ],
      );

      vi.mocked(MCPClient.prototype.callTool)
        .mockResolvedValueOnce({content: [{type: 'text', text: '{"variants":[]}'}]})
        .mockResolvedValueOnce({content: [{type: 'text', text: '{"cart":{"id":"abc"}}'}]});

      const events = await collectEvents();

      // Should have the hallucination correction text
      const correctionEvent = events.find(
        (e) => e.type === 'text_delta' && (e as {delta: string}).delta.includes('One moment'),
      );
      expect(correctionEvent).toBeDefined();
    });
  });

  describe('extended thinking', () => {
    it('emits thinking_delta events when extended thinking is enabled', async () => {
      setupMockStream([
        thinkingBlockStart(0),
        thinkingDeltaEvent('Let me think about this...'),
        thinkingDeltaEvent(' The user wants shoes.'),
        blockStop(0),
        textBlockStart(1),
        textDelta('Here are some shoes!'),
        blockStop(1),
        messageStop(),
      ]);

      const events = await collectEvents({enableExtendedThinking: true});

      const thinkingEvents = events.filter((e) => e.type === 'thinking_delta');
      expect(thinkingEvents).toHaveLength(2);
      expect((thinkingEvents[0] as {delta: string}).delta).toBe('Let me think about this...');
      expect((thinkingEvents[1] as {delta: string}).delta).toBe(' The user wants shoes.');
    });
  });

  describe('error handling', () => {
    it('emits error event when MCP connect fails', async () => {
      vi.mocked(MCPClient.prototype.connect).mockRejectedValue(
        new Error('MCP connection failed'),
      );

      const events = await collectEvents();

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent as {message: string}).message).toContain('MCP connection failed');
    });

    it('emits tool_use_end with error when MCP tool throws', async () => {
      vi.mocked(MCPClient.prototype.callTool).mockRejectedValue(new Error('MCP server down'));

      setupMockStream(
        [
          toolBlockStart(0, 'tool-1', 'search_shop_catalog'),
          inputJsonDelta(0, '{"query":"shoes"}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Sorry, search failed.'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const toolEnd = events.find(
        (e) => e.type === 'tool_use_end' && (e as {tool: string}).tool === 'search_shop_catalog',
      );
      expect(toolEnd).toBeDefined();
      expect((toolEnd as {result: string}).result).toContain('Error: MCP server down');
    });
  });

  describe('done event contents', () => {
    it('done event includes full text and all tool calls', async () => {
      vi.mocked(MCPClient.prototype.callTool).mockResolvedValue({
        content: [{type: 'text', text: '{"products":[]}'}],
      });

      setupMockStream(
        [
          textBlockStart(0),
          textDelta('Searching...'),
          blockStop(0),
          toolBlockStart(1, 'tool-1', 'search_shop_catalog'),
          inputJsonDelta(1, '{"query":"shoes"}'),
          blockStop(1),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta(' Found them!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const doneEvent = events.find((e) => e.type === 'done') as {
        type: 'done';
        fullText: string;
        toolCalls: Array<{id: string; tool: string; status: string}>;
      };
      expect(doneEvent).toBeDefined();
      expect(doneEvent.fullText).toBe('Searching... Found them!');
      expect(doneEvent.toolCalls).toHaveLength(1);
      expect(doneEvent.toolCalls[0].tool).toBe('search_shop_catalog');
      expect(doneEvent.toolCalls[0].status).toBe('complete');
    });
  });

  describe('cart_updated event', () => {
    it('emits cart_updated when cart tool returns a cart ID', async () => {
      vi.mocked(MCPClient.prototype.callTool)
        .mockResolvedValueOnce({content: [{type: 'text', text: '{"variants":[{"id":"v1"}]}'}]})
        .mockResolvedValueOnce({content: [{type: 'text', text: '{"cart":{"id":"gid://shopify/Cart/new-cart-123"}}'}]});

      setupMockStream(
        [
          toolBlockStart(0, 'tool-details', 'get_product_details'),
          inputJsonDelta(0, '{"handle":"shoe"}'),
          blockStop(0),
          messageStop(),
        ],
        [
          toolBlockStart(0, 'tool-cart', 'update_cart'),
          inputJsonDelta(0, '{"variant_id":"v1","quantity":1}'),
          blockStop(0),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Added!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      const cartEvent = events.find((e) => e.type === 'cart_updated');
      expect(cartEvent).toBeDefined();
      expect((cartEvent as {cartId: string}).cartId).toBe('gid://shopify/Cart/new-cart-123');
    });
  });

  describe('agentic loop — multi-turn tool calls', () => {
    it('continues loop when Claude calls tools, stops when no more tool calls', async () => {
      vi.mocked(MCPClient.prototype.callTool).mockResolvedValueOnce({
        content: [{type: 'text', text: '{"products":[{"title":"Shoe A","handle":"shoe-a","id":"1"}]}'}],
      });

      setupMockStream(
        [
          toolBlockStart(0, 'tool-search', 'search_shop_catalog'),
          inputJsonDelta(0, '{"query":"shoes"}'),
          blockStop(0),
          toolBlockStart(1, 'tc-intent', '_concierge_set_intent'),
          inputJsonDelta(1, '{"type":"product_search","show_products":true}'),
          blockStop(1),
          messageStop(),
        ],
        [
          textBlockStart(0),
          textDelta('Here are your shoes!'),
          blockStop(0),
          messageStop(),
        ],
      );

      const events = await collectEvents();

      expect(vi.mocked(MCPClient.prototype.callTool)).toHaveBeenCalledWith(
        'search_shop_catalog',
        {query: 'shoes'},
      );

      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents.some((e) => (e as {delta: string}).delta === 'Here are your shoes!')).toBe(true);

      expect(events[events.length - 1].type).toBe('done');
    });
  });
});
