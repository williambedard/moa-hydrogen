/**
 * Tests for the TTS (text-to-speech) API route.
 * POST /api/voice-tts
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {action} from '../api.voice-tts';

// Mock the voice-services server module
vi.mock('~/lib/voice-services.server', () => ({
  synthesizeSpeech: vi.fn(),
}));

import {synthesizeSpeech} from '~/lib/voice-services.server';

const mockedSynthesize = vi.mocked(synthesizeSpeech);

function makeRequest(formData: FormData): Request {
  return new Request('http://localhost/api/voice-tts', {
    method: 'POST',
    body: formData,
  });
}

function makeContext(overrides: Record<string, string> = {}) {
  return {
    env: {
      OPENAI_BASE_URL: 'https://api.openai.com',
      OPENAI_API_KEY: 'test-key',
      ...overrides,
    },
  } as any;
}

describe('api.voice-tts action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if no text field is provided', async () => {
    const formData = new FormData();
    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/missing text/i);
  });

  it('returns 400 if text field is empty/whitespace', async () => {
    const formData = new FormData();
    formData.append('text', '   ');
    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/missing text/i);
  });

  it('returns audio stream on successful synthesis', async () => {
    const fakeAudioBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xfb, 0x90, 0x00]));
        controller.close();
      },
    });
    mockedSynthesize.mockResolvedValue(new Response(fakeAudioBody, {
      headers: {'Content-Type': 'audio/mpeg'},
    }));

    const formData = new FormData();
    formData.append('text', 'Hello world');
    const request = makeRequest(formData);
    const context = makeContext();
    const response = await action({request, context, params: {} as any});

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');

    expect(mockedSynthesize).toHaveBeenCalledWith(
      'Hello world',
      'https://api.openai.com',
      'test-key',
    );
  });

  it('returns 500 when synthesis throws an error', async () => {
    mockedSynthesize.mockRejectedValue(new Error('TTS API error: 500'));

    const formData = new FormData();
    formData.append('text', 'Hello');
    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('TTS API error: 500');
  });

  it('returns generic error message for non-Error exceptions', async () => {
    mockedSynthesize.mockRejectedValue('unknown failure');

    const formData = new FormData();
    formData.append('text', 'Hello');
    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Speech synthesis failed');
  });

  it('passes trimmed text to synthesizeSpeech', async () => {
    const fakeAudioBody = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    mockedSynthesize.mockResolvedValue(new Response(fakeAudioBody, {
      headers: {'Content-Type': 'audio/mpeg'},
    }));

    const formData = new FormData();
    formData.append('text', '  Hello world  ');
    const request = makeRequest(formData);
    await action({request, context: makeContext(), params: {} as any});

    // Text should be trimmed before passing
    expect(mockedSynthesize).toHaveBeenCalledWith(
      'Hello world',
      expect.any(String),
      expect.any(String),
    );
  });
});
