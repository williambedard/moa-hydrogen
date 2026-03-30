/**
 * Tests for the Gemini image generation service.
 * Verifies success paths, error handling, and timeout behavior.
 *
 * The image generation module uses a Shopify proxy to Vertex AI
 * (gemini-3-pro-image-preview). It sends a prompt and returns a
 * data URL (base64) on success, or null on failure/timeout.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {generateHeaderImage} from '../image-generation.server';

const PROXY_URL = 'https://gemini-proxy.example.com/generate';
const API_KEY = 'test-key-123';
const TEST_PROMPT = 'A serene landscape with mountains';

// Helper: build a Gemini-style response with inlineData
function geminiImageResponse(
  base64 = 'iVBORw0KGgoAAAANSUhEUg==',
  mimeType = 'image/png',
) {
  return {
    candidates: [
      {
        content: {
          parts: [{inlineData: {mimeType, data: base64}}],
        },
      },
    ],
  };
}

// Helper: build a Gemini-style response using the `image` key (alternate format)
function geminiImageResponseAlt(
  base64 = 'iVBORw0KGgoAAAANSUhEUg==',
  mimeType = 'image/png',
) {
  return {
    candidates: [
      {
        content: {
          parts: [{image: {mimeType, data: base64}}],
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(JSON.stringify(geminiImageResponse()), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('generateHeaderImage', () => {
  describe('successful generation', () => {
    it('returns a data URL when Gemini responds with inlineData', async () => {
      const base64 = 'dGVzdGltYWdlZGF0YQ==';
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(geminiImageResponse(base64, 'image/png')), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBe(`data:image/png;base64,${base64}`);
    });

    it('returns a data URL when Gemini responds with image key (alternate format)', async () => {
      const base64 = 'YWx0Zm9ybWF0ZGF0YQ==';
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(geminiImageResponseAlt(base64, 'image/jpeg')), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBe(`data:image/jpeg;base64,${base64}`);
    });

    it('defaults mimeType to image/png when not provided', async () => {
      const base64 = 'bm9taW1l';
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{content: {parts: [{inlineData: {mimeType: '', data: base64}}]}}],
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        ),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBe(`data:image/png;base64,${base64}`);
    });
  });

  describe('correct request parameters', () => {
    it('sends the prompt to the proxy URL with correct headers and body shape', async () => {
      await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        PROXY_URL,
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: expect.any(AbortSignal),
        }),
      );

      // Verify body structure matches Gemini API format
      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body).toEqual({
        contents: [{role: 'user', parts: [{text: TEST_PROMPT}]}],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 1.0,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '1K',
          },
        },
      });
    });
  });

  describe('API error responses', () => {
    it('returns null on 400 error', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response('Bad Request', {status: 400}),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null on 500 error', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response('Internal Server Error', {status: 500}),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null on 429 rate limit error', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response('Rate limited', {status: 429}),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });
  });

  describe('network errors', () => {
    it('returns null when fetch throws a network error', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network failure'));

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null on AbortError (from timeout or external abort)', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      vi.mocked(globalThis.fetch).mockRejectedValue(abortError);

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });
  });

  describe('timeout', () => {
    it('returns null after 45s timeout when fetch hangs', async () => {
      vi.useFakeTimers();

      // fetch that never resolves
      vi.mocked(globalThis.fetch).mockImplementation(
        () => new Promise<Response>(() => {}),
      );

      const promise = generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      // Advance past the 45s timeout
      await vi.advanceTimersByTimeAsync(45_001);

      const result = await promise;
      expect(result).toBeNull();
    });

    it('does not timeout when request completes quickly', async () => {
      vi.useFakeTimers();

      const base64 = 'cXVpY2s=';
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(geminiImageResponse(base64)), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
      );

      const promise = generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      // Let the microtask resolve the fetch
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe(`data:image/png;base64,${base64}`);
    });
  });

  describe('malformed responses', () => {
    it('returns null when response JSON has no candidates', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null when candidates is empty array', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({candidates: []}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null when candidate has no content parts', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({candidates: [{content: {parts: []}}]}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null when parts contain only text (no image data)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{content: {parts: [{text: 'No image generated'}]}}],
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        ),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null when inlineData has no data field', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{content: {parts: [{inlineData: {mimeType: 'image/png'}}]}}],
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        ),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBeNull();
    });
  });

  describe('multiple parts in response', () => {
    it('returns data URL from the first part with image data (skipping text parts)', async () => {
      const base64 = 'Zmlyc3RpbWFnZQ==';
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {text: 'Here is your image'},
                    {inlineData: {mimeType: 'image/png', data: base64}},
                  ],
                },
              },
            ],
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        ),
      );

      const result = await generateHeaderImage(TEST_PROMPT, PROXY_URL, API_KEY);

      expect(result).toBe(`data:image/png;base64,${base64}`);
    });
  });
});
