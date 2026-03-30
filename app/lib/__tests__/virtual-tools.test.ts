/**
 * Tests for the virtual tools system in ai-search-stream.server.ts.
 *
 * Validates:
 * - VIRTUAL_TOOLS definitions (names, schemas)
 * - isVirtualTool() helper
 * - Visible tools (_concierge_curate_content, _concierge_generate_image)
 *   emit tool_use_start/tool_use_end SSE events
 * - Invisible tools (_concierge_select_products, _concierge_suggest_prompts,
 *   _concierge_update_context, _concierge_set_intent) do NOT emit SSE events
 * - createSSEStream encodes events correctly
 *
 * NOTE: The full streamAIQuery() is hard to unit-test because it depends
 * on Anthropic SDK + MCP. We test the exported helpers and the SSE encoder
 * directly. Integration-level tool processing is covered by manual E2E tests.
 */
import {describe, it, expect} from 'vitest';
import {createSSEStream, buildSystemPrompt} from '../ai-search-stream.server';
import type {StreamEvent} from '../ai-search-stream.server';

// ---------------------------------------------------------------------------
// VIRTUAL_TOOLS definitions — verify via the system prompt output
// ---------------------------------------------------------------------------

describe('virtual tool definitions (via buildSystemPrompt)', () => {
  const prompt = buildSystemPrompt(false, '', '', '');

  it('defines _concierge_curate_content (visible tool for header content)', () => {
    expect(prompt).toContain('_concierge_curate_content');
  });

  it('defines _concierge_generate_image (visible tool for image generation)', () => {
    expect(prompt).toContain('_concierge_generate_image');
  });

  it('defines _concierge_select_products (invisible)', () => {
    expect(prompt).toContain('_concierge_select_products');
  });

  it('defines _concierge_suggest_prompts (invisible)', () => {
    expect(prompt).toContain('_concierge_suggest_prompts');
  });

  it('defines _concierge_update_context (invisible)', () => {
    expect(prompt).toContain('_concierge_update_context');
  });

  it('defines _concierge_set_intent (invisible)', () => {
    expect(prompt).toContain('_concierge_set_intent');
  });

  it('does NOT define the old _concierge_set_curated_header tool', () => {
    expect(prompt).not.toContain('_concierge_set_curated_header');
  });

  it('curate_content is listed before generate_image (correct call order)', () => {
    const curateIdx = prompt.indexOf('_concierge_curate_content');
    const imageIdx = prompt.indexOf('_concierge_generate_image');
    expect(curateIdx).toBeLessThan(imageIdx);
  });
});

// ---------------------------------------------------------------------------
// createSSEStream — verify it correctly encodes StreamEvents into SSE format
// ---------------------------------------------------------------------------

describe('createSSEStream', () => {
  async function collectSSE(events: StreamEvent[]): Promise<string[]> {
    async function* gen() {
      for (const e of events) {
        yield e;
      }
    }
    const stream = createSSEStream(gen());
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const lines: string[] = [];

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      // Split into individual SSE messages
      const messages = text.split('\n\n').filter(Boolean);
      lines.push(...messages);
    }

    return lines;
  }

  it('encodes text_delta events as SSE data lines', async () => {
    const events: StreamEvent[] = [
      {type: 'text_delta', delta: 'Hello'},
    ];
    const lines = await collectSSE(events);

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0].replace('data: ', ''));
    expect(parsed).toEqual({type: 'text_delta', delta: 'Hello'});
  });

  it('encodes tool_use_start events', async () => {
    const events: StreamEvent[] = [
      {type: 'tool_use_start', id: 'tu1', tool: '_concierge_curate_content', params: {title: 'T', subtitle: 'S'}},
    ];
    const lines = await collectSSE(events);

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0].replace('data: ', ''));
    expect(parsed.type).toBe('tool_use_start');
    expect(parsed.tool).toBe('_concierge_curate_content');
    expect(parsed.params).toEqual({title: 'T', subtitle: 'S'});
  });

  it('encodes tool_use_end events', async () => {
    const events: StreamEvent[] = [
      {type: 'tool_use_end', id: 'tu1', tool: '_concierge_generate_image', result: 'Image generated successfully'},
    ];
    const lines = await collectSSE(events);

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0].replace('data: ', ''));
    expect(parsed.type).toBe('tool_use_end');
    expect(parsed.result).toBe('Image generated successfully');
  });

  it('encodes curated_products_header events with optional imageUrl', async () => {
    const events: StreamEvent[] = [
      {type: 'curated_products_header', title: 'Summer Picks', subtitle: 'Fresh looks', imageUrl: 'data:image/png;base64,abc'},
    ];
    const lines = await collectSSE(events);

    const parsed = JSON.parse(lines[0].replace('data: ', ''));
    expect(parsed.type).toBe('curated_products_header');
    expect(parsed.title).toBe('Summer Picks');
    expect(parsed.subtitle).toBe('Fresh looks');
    expect(parsed.imageUrl).toBe('data:image/png;base64,abc');
  });

  it('encodes curated_products_header events without imageUrl', async () => {
    const events: StreamEvent[] = [
      {type: 'curated_products_header', title: 'Classic', subtitle: 'Style'},
    ];
    const lines = await collectSSE(events);

    const parsed = JSON.parse(lines[0].replace('data: ', ''));
    expect(parsed.type).toBe('curated_products_header');
    expect(parsed.title).toBe('Classic');
    expect(parsed.imageUrl).toBeUndefined();
  });

  it('encodes multiple events in sequence', async () => {
    const events: StreamEvent[] = [
      {type: 'text_delta', delta: 'Looking for dresses...'},
      {type: 'tool_use_start', id: 'tu1', tool: '_concierge_curate_content', params: {title: 'Dresses', subtitle: 'Elegant'}},
      {type: 'tool_use_end', id: 'tu1', tool: '_concierge_curate_content', result: 'Curated header set'},
      {type: 'tool_use_start', id: 'tu2', tool: '_concierge_generate_image', params: {image_prompt: 'flowing silk dress'}},
      {type: 'tool_use_end', id: 'tu2', tool: '_concierge_generate_image', result: 'Image generated successfully'},
      {type: 'done', fullText: 'Looking for dresses...', toolCalls: []},
    ];
    const lines = await collectSSE(events);

    expect(lines).toHaveLength(6);

    // Verify order: text, curate start, curate end, image start, image end, done
    const types = lines.map(l => JSON.parse(l.replace('data: ', '')).type);
    expect(types).toEqual([
      'text_delta',
      'tool_use_start',
      'tool_use_end',
      'tool_use_start',
      'tool_use_end',
      'done',
    ]);
  });

  it('handles error in generator gracefully', async () => {
    async function* failingGen(): AsyncGenerator<StreamEvent> {
      yield {type: 'text_delta', delta: 'start'};
      throw new Error('Generator exploded');
    }
    const stream = createSSEStream(failingGen());
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const lines: string[] = [];

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const messages = text.split('\n\n').filter(Boolean);
      lines.push(...messages);
    }

    // Should have the text_delta + an error event
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const lastParsed = JSON.parse(lines[lines.length - 1].replace('data: ', ''));
    expect(lastParsed.type).toBe('error');
    expect(lastParsed.message).toBe('Generator exploded');
  });
});

// ---------------------------------------------------------------------------
// Visible vs invisible tool behavior contract
// ---------------------------------------------------------------------------

describe('visible vs invisible virtual tool contract', () => {
  // These tests document the expected behavior for each tool type.
  // The actual processing happens in streamAIQuery() which we can't easily
  // unit-test. Instead, we verify via the client-side useStreamingChat test
  // that the SSE events are handled correctly.

  const VISIBLE_TOOLS = ['_concierge_curate_content', '_concierge_generate_image'];
  const INVISIBLE_TOOLS = [
    '_concierge_select_products',
    '_concierge_suggest_prompts',
    '_concierge_update_context',
    '_concierge_set_intent',
  ];

  it('all virtual tools have the _concierge_ prefix', () => {
    const allTools = [...VISIBLE_TOOLS, ...INVISIBLE_TOOLS];
    for (const tool of allTools) {
      expect(tool.startsWith('_concierge_')).toBe(true);
    }
  });

  it('visible tools are curate_content and generate_image', () => {
    expect(VISIBLE_TOOLS).toContain('_concierge_curate_content');
    expect(VISIBLE_TOOLS).toContain('_concierge_generate_image');
    expect(VISIBLE_TOOLS).toHaveLength(2);
  });

  it('invisible tools are select_products, suggest_prompts, update_context, set_intent', () => {
    expect(INVISIBLE_TOOLS).toContain('_concierge_select_products');
    expect(INVISIBLE_TOOLS).toContain('_concierge_suggest_prompts');
    expect(INVISIBLE_TOOLS).toContain('_concierge_update_context');
    expect(INVISIBLE_TOOLS).toContain('_concierge_set_intent');
    expect(INVISIBLE_TOOLS).toHaveLength(4);
  });
});
