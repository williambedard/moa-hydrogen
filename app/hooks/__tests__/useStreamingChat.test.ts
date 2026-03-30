/**
 * Tests for the useStreamingChat hook.
 * Verifies contentBlocks interleaving across various stream event sequences.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useStreamingChat} from '../useStreamingChat';

// ---- Helpers ----

/** Encode a sequence of SSE events into a ReadableStream body. */
function makeSSEStream(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n`).join('');
  const payload = lines + 'data: [DONE]\n';

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

/** Build a mock Response that mimics the SSE endpoint. */
function mockSSEResponse(events: Array<Record<string, unknown>>): Response {
  return new Response(makeSSEStream(events), {
    status: 200,
    headers: {'Content-Type': 'text/event-stream'},
  });
}

/** Shorthand for a text_delta event. */
function textDelta(delta: string) {
  return {type: 'text_delta', delta};
}

/** Shorthand for a tool_use_start event. */
function toolStart(id: string, tool: string, params: Record<string, unknown> = {}) {
  return {type: 'tool_use_start', id, tool, params};
}

/** Shorthand for a tool_use_end event. */
function toolEnd(id: string, tool: string, result: string = 'OK') {
  return {type: 'tool_use_end', id, tool, result};
}

/** Shorthand for a done event. */
function doneEvent(fullText: string, toolCalls: Array<Record<string, unknown>> = []) {
  return {type: 'done', fullText, toolCalls};
}

// ---- Setup / Teardown ----

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    // Default: return an empty SSE stream
    return mockSSEResponse([doneEvent('')]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Tests ----

describe('useStreamingChat', () => {
  describe('initial state', () => {
    it('starts with default state values', () => {
      const {result} = renderHook(() => useStreamingChat());

      expect(result.current.state.isStreaming).toBe(false);
      expect(result.current.state.streamedText).toBe('');
      expect(result.current.state.contentBlocks).toEqual([]);
      expect(result.current.state.toolCalls).toEqual([]);
      expect(result.current.state.products).toBeNull();
      expect(result.current.state.curatedHeader).toBeNull();
      expect(result.current.state.suggestedPrompts).toBeNull();
      expect(result.current.state.contextUpdate).toBeNull();
      expect(result.current.state.intent).toBeNull();
      expect(result.current.state.cartId).toBeNull();
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.fullText).toBeNull();
    });
  });

  describe('text-only response (no tool calls)', () => {
    it('creates a single text content block', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Hello '),
          textDelta('world!'),
          doneEvent('Hello world!'),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.contentBlocks).toEqual([
        {type: 'text', text: 'Hello world!'},
      ]);
      expect(result.current.state.streamedText).toBe('Hello world!');
      expect(result.current.state.fullText).toBe('Hello world!');
      expect(result.current.state.isStreaming).toBe(false);
    });
  });

  describe('text -> tool -> text pattern', () => {
    it('interleaves text and tool blocks in stream order', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Before tools. '),
          toolStart('t1', 'shopify_search', {query: 'shoes'}),
          toolEnd('t1', 'shopify_search', '{"products":[]}'),
          textDelta('After tools.'),
          doneEvent('Before tools. After tools.', [
            {id: 't1', tool: 'shopify_search', params: {query: 'shoes'}, result: '{"products":[]}', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.contentBlocks).toHaveLength(3);
      expect(result.current.state.contentBlocks[0]).toEqual({type: 'text', text: 'Before tools. '});
      expect(result.current.state.contentBlocks[1]).toEqual(
        expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({id: 't1', status: 'complete'})}),
      );
      expect(result.current.state.contentBlocks[2]).toEqual({type: 'text', text: 'After tools.'});
      expect(result.current.state.streamedText).toBe('Before tools. After tools.');
      expect(result.current.state.isStreaming).toBe(false);
    });
  });

  describe('tool -> text (no pre-tool text)', () => {
    it('starts with a tool block, then text block', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('t1', 'shopify_search', {query: 'dresses'}),
          toolEnd('t1', 'shopify_search', '{"results":[]}'),
          textDelta('Here are the results.'),
          doneEvent('Here are the results.', [
            {id: 't1', tool: 'shopify_search', params: {query: 'dresses'}, result: '{"results":[]}', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.contentBlocks).toHaveLength(2);
      expect(result.current.state.contentBlocks[0]).toEqual(
        expect.objectContaining({type: 'tool'}),
      );
      expect(result.current.state.contentBlocks[1]).toEqual({type: 'text', text: 'Here are the results.'});
    });
  });

  describe('text -> tool -> text -> tool -> text (multiple tools)', () => {
    it('interleaves all blocks in order', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Intro. '),
          toolStart('t1', 'shopify_search', {query: 'shirts'}),
          toolEnd('t1', 'shopify_search', '[]'),
          textDelta('Middle. '),
          toolStart('t2', 'shopify_search', {query: 'pants'}),
          toolEnd('t2', 'shopify_search', '[]'),
          textDelta('Outro.'),
          doneEvent('Intro. Middle. Outro.', [
            {id: 't1', tool: 'shopify_search', params: {query: 'shirts'}, result: '[]', status: 'complete'},
            {id: 't2', tool: 'shopify_search', params: {query: 'pants'}, result: '[]', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.contentBlocks).toHaveLength(5);
      expect(result.current.state.contentBlocks[0]).toEqual({type: 'text', text: 'Intro. '});
      expect(result.current.state.contentBlocks[1]).toEqual(expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({id: 't1'})}));
      expect(result.current.state.contentBlocks[2]).toEqual({type: 'text', text: 'Middle. '});
      expect(result.current.state.contentBlocks[3]).toEqual(expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({id: 't2'})}));
      expect(result.current.state.contentBlocks[4]).toEqual({type: 'text', text: 'Outro.'});
      expect(result.current.state.toolCalls).toHaveLength(2);
    });
  });

  describe('stream with only tool calls (no text)', () => {
    it('has only tool blocks', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('t1', 'cart_add', {variantId: 'v1'}),
          toolEnd('t1', 'cart_add', 'added'),
          doneEvent('', [
            {id: 't1', tool: 'cart_add', params: {variantId: 'v1'}, result: 'added', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.contentBlocks).toHaveLength(1);
      expect(result.current.state.contentBlocks[0]).toEqual(
        expect.objectContaining({type: 'tool'}),
      );
      expect(result.current.state.streamedText).toBe('');
    });
  });

  describe('done event finalizes state', () => {
    it('sets fullText and isStreaming to false', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Complete response.'),
          doneEvent('Complete response.'),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.fullText).toBe('Complete response.');
      expect(result.current.state.isStreaming).toBe(false);
    });

    it('preserves contentBlocks in final state', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Before. '),
          toolStart('t1', 'search', {}),
          toolEnd('t1', 'search', 'ok'),
          textDelta('After.'),
          doneEvent('Before. After.', [
            {id: 't1', tool: 'search', params: {}, result: 'ok', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.contentBlocks).toHaveLength(3);
      expect(result.current.state.contentBlocks[0]).toEqual({type: 'text', text: 'Before. '});
      expect(result.current.state.contentBlocks[2]).toEqual({type: 'text', text: 'After.'});
      expect(result.current.state.fullText).toBe('Before. After.');
    });
  });

  describe('tool call tracking', () => {
    it('tracks tool_use_start in both toolCalls and contentBlocks', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('t1', 'search', {q: 'test'}),
          // No tool_use_end — simulates in-progress tool
          doneEvent('', [{id: 't1', tool: 'search', params: {q: 'test'}, status: 'pending'}]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.toolCalls).toHaveLength(1);
      expect(result.current.state.contentBlocks).toHaveLength(1);
      expect(result.current.state.contentBlocks[0]).toEqual(
        expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({id: 't1'})}),
      );
    });

    it('updates tool status to complete on tool_use_end', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('t1', 'search', {q: 'shoes'}),
          toolEnd('t1', 'search', '5 results'),
          doneEvent('', [
            {id: 't1', tool: 'search', params: {q: 'shoes'}, result: '5 results', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.toolCalls).toEqual([
        expect.objectContaining({id: 't1', tool: 'search', status: 'complete', result: '5 results'}),
      ]);
      // Also check contentBlocks mirrors the update
      const toolBlock = result.current.state.contentBlocks[0];
      expect(toolBlock).toEqual(
        expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({status: 'complete'})}),
      );
    });
  });

  describe('other event types', () => {
    it('handles curated_products event', async () => {
      const mockProducts = [
        {id: 'p1', handle: 'shoe', title: 'Shoe', description: '', url: '', price: '50', images: [], tags: [], availableForSale: true},
      ];
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'curated_products', products: mockProducts},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.products).toEqual(mockProducts);
    });

    it('handles curated_products_header event', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'curated_products_header', title: 'Top Picks', subtitle: 'For you'},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader).toEqual({title: 'Top Picks', subtitle: 'For you'});
    });

    it('handles curated_products_header with imageUrl', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'curated_products_header', title: 'Summer Vibes', subtitle: 'Cool picks', imageUrl: 'https://example.com/summer.png'},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader).toEqual({
        title: 'Summer Vibes',
        subtitle: 'Cool picks',
        imageUrl: 'https://example.com/summer.png',
      });
    });

    it('handles curated_products_header without imageUrl (backwards compatible)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'curated_products_header', title: 'Classic Picks', subtitle: 'Timeless style'},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader).toEqual({
        title: 'Classic Picks',
        subtitle: 'Timeless style',
      });
      expect(result.current.state.curatedHeader?.imageUrl).toBeUndefined();
    });

    it('handles suggested_prompts event', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'suggested_prompts', prompts: ['Try this', 'Or this']},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.suggestedPrompts).toEqual(['Try this', 'Or this']);
    });

    it('handles context_update event', async () => {
      const update = {preferences: {colors: ['red']}, constraints: ['no wool']};
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'context_update', update},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.contextUpdate).toEqual(update);
    });

    it('handles intent event', async () => {
      const intent = {type: 'product_search', showProducts: true};
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'intent', intent},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.intent).toEqual(intent);
    });

    it('handles cart_updated event', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'cart_updated', cartId: 'cart-123'},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.cartId).toBe('cart-123');
    });

    it('handles thinking_delta event', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'thinking_delta', delta: 'Let me think...'},
          {type: 'thinking_delta', delta: ' about that.'},
          doneEvent(''),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.thinkingText).toBe('Let me think... about that.');
    });

    it('handles error event', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'error', message: 'Something went wrong'},
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.error).toBe('Something went wrong');
      expect(result.current.state.isStreaming).toBe(false);
    });
  });

  describe('error handling', () => {
    it('sets error on HTTP error response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response('Internal Server Error', {status: 500}),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.error).toBe('HTTP error: 500');
      expect(result.current.state.isStreaming).toBe(false);
    });

    it('handles fetch network error', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network failure'));

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.error).toBe('Network failure');
      expect(result.current.state.isStreaming).toBe(false);
    });

    it('silently handles AbortError (intentional abort)', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(
        new DOMException('Aborted', 'AbortError'),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.error).toBeNull();
    });
  });

  describe('reset', () => {
    it('resets all state back to initial values', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Some text'),
          doneEvent('Some text'),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.fullText).toBe('Some text');

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.isStreaming).toBe(false);
      expect(result.current.state.streamedText).toBe('');
      expect(result.current.state.contentBlocks).toEqual([]);
      expect(result.current.state.fullText).toBeNull();
      expect(result.current.state.toolCalls).toEqual([]);
    });
  });

  describe('startStream resets previous state', () => {
    it('clears previous state when starting a new stream', async () => {
      // First stream
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        mockSSEResponse([
          textDelta('First response'),
          doneEvent('First response'),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.fullText).toBe('First response');

      // Second stream
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        mockSSEResponse([
          textDelta('Second response'),
          doneEvent('Second response'),
        ]),
      );

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.fullText).toBe('Second response');
      expect(result.current.state.streamedText).toBe('Second response');
      expect(result.current.state.contentBlocks).toEqual([
        {type: 'text', text: 'Second response'},
      ]);
    });
  });

  describe('stream_start handling', () => {
    it('handles stream_start event without error', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          {type: 'stream_start'},
          textDelta('Connected!'),
          doneEvent('Connected!'),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      // stream_start should not affect text content
      expect(result.current.state.streamedText).toBe('Connected!');
      expect(result.current.state.fullText).toBe('Connected!');
      expect(result.current.state.isStreaming).toBe(false);
    });
  });

  describe('progressive product rendering', () => {
    it('products state updates mid-stream (before done)', async () => {
      const mockProducts = [
        {id: 'p1', handle: 'shoe', title: 'Shoe', description: '', url: '', price: '50', images: [], tags: [], availableForSale: true},
      ];
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Here are results: '),
          {type: 'curated_products', products: mockProducts},
          textDelta('Enjoy!'),
          doneEvent('Here are results: Enjoy!'),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.products).toEqual(mockProducts);
      expect(result.current.state.isStreaming).toBe(false);
    });
  });

  describe('abort handling', () => {
    it('reset aborts the stream and resets state', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Some text'),
          doneEvent('Some text'),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.fullText).toBe('Some text');

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.isStreaming).toBe(false);
      expect(result.current.state.streamedText).toBe('');
      expect(result.current.state.fullText).toBeNull();
      expect(result.current.state.products).toBeNull();
      expect(result.current.state.curatedHeader).toBeNull();
      expect(result.current.state.error).toBeNull();
    });
  });

  // ---- Visible curated tool flow tests ----

  describe('visible curated tool flow (_concierge_curate_content + _concierge_generate_image)', () => {
    it('tracks _concierge_curate_content as a visible tool call', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Let me find some options...'),
          toolStart('tc-curate', '_concierge_curate_content', {title: 'Elegant Dresses', subtitle: 'For your special occasion'}),
          toolEnd('tc-curate', '_concierge_curate_content', 'Curated header set: "Elegant Dresses" — "For your special occasion"'),
          doneEvent('Let me find some options...', [
            {id: 'tc-curate', tool: '_concierge_curate_content', params: {title: 'Elegant Dresses', subtitle: 'For your special occasion'}, result: 'Curated header set', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.toolCalls).toHaveLength(1);
      expect(result.current.state.toolCalls[0].tool).toBe('_concierge_curate_content');
      expect(result.current.state.toolCalls[0].status).toBe('complete');
    });

    it('tracks _concierge_generate_image as a visible tool call', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('tc-img', '_concierge_generate_image', {image_prompt: 'flowing silk dress on marble'}),
          toolEnd('tc-img', '_concierge_generate_image', 'Image generated successfully'),
          doneEvent('', [
            {id: 'tc-img', tool: '_concierge_generate_image', params: {image_prompt: 'flowing silk dress on marble'}, result: 'Image generated successfully', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.toolCalls).toHaveLength(1);
      expect(result.current.state.toolCalls[0].tool).toBe('_concierge_generate_image');
    });

    it('handles full search flow: text -> MCP search -> curate_content -> generate_image -> text', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          textDelta('Let me find dresses for you. '),
          toolStart('tc-search', 'search_shop_catalog', {query: 'evening dresses'}),
          toolEnd('tc-search', 'search_shop_catalog', '{"products":[]}'),
          toolStart('tc-curate', '_concierge_curate_content', {title: 'Evening Elegance', subtitle: 'Stunning dresses'}),
          toolEnd('tc-curate', '_concierge_curate_content', 'Curated header set'),
          toolStart('tc-img', '_concierge_generate_image', {image_prompt: 'elegant evening gown on mannequin'}),
          toolEnd('tc-img', '_concierge_generate_image', 'Image generated successfully'),
          textDelta('Here are some beautiful options!'),
          {type: 'curated_products_header', title: 'Evening Elegance', subtitle: 'Stunning dresses', imageUrl: 'data:image/png;base64,abc'},
          doneEvent('Let me find dresses for you. Here are some beautiful options!', [
            {id: 'tc-search', tool: 'search_shop_catalog', params: {query: 'evening dresses'}, result: '...', status: 'complete'},
            {id: 'tc-curate', tool: '_concierge_curate_content', params: {title: 'Evening Elegance', subtitle: 'Stunning dresses'}, result: 'Curated header set', status: 'complete'},
            {id: 'tc-img', tool: '_concierge_generate_image', params: {image_prompt: 'elegant evening gown'}, result: 'Image generated', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      // Tool calls tracked
      expect(result.current.state.toolCalls).toHaveLength(3);
      expect(result.current.state.toolCalls.map(tc => tc.tool)).toEqual([
        'search_shop_catalog',
        '_concierge_curate_content',
        '_concierge_generate_image',
      ]);

      // Curated header with image
      expect(result.current.state.curatedHeader).toEqual({
        title: 'Evening Elegance',
        subtitle: 'Stunning dresses',
        imageUrl: 'data:image/png;base64,abc',
      });

      // Content blocks in stream order: text, 3 tools, text
      expect(result.current.state.contentBlocks).toHaveLength(5);
      expect(result.current.state.contentBlocks[0]).toEqual({type: 'text', text: 'Let me find dresses for you. '});
      expect(result.current.state.contentBlocks[1]).toEqual(expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({tool: 'search_shop_catalog'})}));
      expect(result.current.state.contentBlocks[2]).toEqual(expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({tool: '_concierge_curate_content'})}));
      expect(result.current.state.contentBlocks[3]).toEqual(expect.objectContaining({type: 'tool', toolCall: expect.objectContaining({tool: '_concierge_generate_image'})}));
      expect(result.current.state.contentBlocks[4]).toEqual({type: 'text', text: 'Here are some beautiful options!'});
    });

    it('handles curated header without image (image generation failed/timed out)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('tc-curate', '_concierge_curate_content', {title: 'Summer Picks', subtitle: 'Cool vibes'}),
          toolEnd('tc-curate', '_concierge_curate_content', 'Curated header set'),
          toolStart('tc-img', '_concierge_generate_image', {image_prompt: 'summer beach scene'}),
          toolEnd('tc-img', '_concierge_generate_image', 'Image generation failed or timed out — header will render without image'),
          {type: 'curated_products_header', title: 'Summer Picks', subtitle: 'Cool vibes'},
          doneEvent('', [
            {id: 'tc-curate', tool: '_concierge_curate_content', params: {}, result: 'set', status: 'complete'},
            {id: 'tc-img', tool: '_concierge_generate_image', params: {}, result: 'failed', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader).toEqual({
        title: 'Summer Picks',
        subtitle: 'Cool vibes',
      });
      expect(result.current.state.curatedHeader?.imageUrl).toBeUndefined();
    });

    it('handles curate_content without generate_image (Claude skips image)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('tc-curate', '_concierge_curate_content', {title: 'Quick Results', subtitle: 'Found these'}),
          toolEnd('tc-curate', '_concierge_curate_content', 'Curated header set'),
          {type: 'curated_products_header', title: 'Quick Results', subtitle: 'Found these'},
          doneEvent('', [
            {id: 'tc-curate', tool: '_concierge_curate_content', params: {}, result: 'set', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader).toEqual({
        title: 'Quick Results',
        subtitle: 'Found these',
      });
      expect(result.current.state.curatedHeader?.imageUrl).toBeUndefined();
      expect(result.current.state.toolCalls).toHaveLength(1);
    });

    it('handles generate_image with empty prompt (skipped)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('tc-img', '_concierge_generate_image', {image_prompt: ''}),
          toolEnd('tc-img', '_concierge_generate_image', 'No image prompt provided — skipping image generation'),
          doneEvent('', [
            {id: 'tc-img', tool: '_concierge_generate_image', params: {image_prompt: ''}, result: 'skipped', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.toolCalls).toHaveLength(1);
      expect(result.current.state.toolCalls[0].tool).toBe('_concierge_generate_image');
      expect(result.current.state.curatedHeader).toBeNull();
    });

    it('progressive rendering: header appears before image generation completes', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('tc-curate', '_concierge_curate_content', {title: 'Title First', subtitle: 'Then image'}),
          toolEnd('tc-curate', '_concierge_curate_content', 'Curated header set'),
          toolStart('tc-img', '_concierge_generate_image', {image_prompt: 'scene'}),
          toolEnd('tc-img', '_concierge_generate_image', 'Image generated successfully'),
          {type: 'curated_products_header', title: 'Title First', subtitle: 'Then image', imageUrl: 'data:image/png;base64,xyz'},
          doneEvent('', []),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader).toEqual({
        title: 'Title First',
        subtitle: 'Then image',
        imageUrl: 'data:image/png;base64,xyz',
      });
    });

    it('multiple searches in sequence: state resets properly', async () => {
      // First search
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        mockSSEResponse([
          toolStart('tc1-curate', '_concierge_curate_content', {title: 'First Search', subtitle: 'Results 1'}),
          toolEnd('tc1-curate', '_concierge_curate_content', 'set'),
          {type: 'curated_products_header', title: 'First Search', subtitle: 'Results 1'},
          doneEvent('', []),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader?.title).toBe('First Search');

      // Second search (new stream resets state)
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        mockSSEResponse([
          toolStart('tc2-curate', '_concierge_curate_content', {title: 'Second Search', subtitle: 'Results 2'}),
          toolEnd('tc2-curate', '_concierge_curate_content', 'set'),
          {type: 'curated_products_header', title: 'Second Search', subtitle: 'Results 2', imageUrl: 'data:image/png;base64,new'},
          doneEvent('', []),
        ]),
      );

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.curatedHeader).toEqual({
        title: 'Second Search',
        subtitle: 'Results 2',
        imageUrl: 'data:image/png;base64,new',
      });
    });
  });

  describe('done event merges server-only tool calls', () => {
    it('adds server-only tools to both toolCalls and contentBlocks', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockSSEResponse([
          toolStart('t1', 'search', {q: 'test'}),
          toolEnd('t1', 'search', 'ok'),
          doneEvent('', [
            {id: 't1', tool: 'search', params: {q: 'test'}, result: 'ok', status: 'complete'},
            // Server-only tool (e.g. from hallucination retry)
            {id: 't2', tool: 'retry_search', params: {q: 'test'}, result: 'ok', status: 'complete'},
          ]),
        ]),
      );

      const {result} = renderHook(() => useStreamingChat());

      await act(async () => {
        await result.current.startStream(new FormData());
      });

      expect(result.current.state.toolCalls).toHaveLength(2);
      expect(result.current.state.contentBlocks.filter((b) => b.type === 'tool')).toHaveLength(2);
    });
  });
});
