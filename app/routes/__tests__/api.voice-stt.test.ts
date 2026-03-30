/**
 * Tests for the STT (speech-to-text) API route.
 * POST /api/voice-stt
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {action} from '../api.voice-stt';

// Mock the voice-services server module
vi.mock('~/lib/voice-services.server', () => ({
  transcribeAudio: vi.fn(),
}));

import {transcribeAudio} from '~/lib/voice-services.server';

const mockedTranscribe = vi.mocked(transcribeAudio);

function makeRequest(formData: FormData): Request {
  return new Request('http://localhost/api/voice-stt', {
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

describe('api.voice-stt action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if no audio field is provided', async () => {
    const formData = new FormData();
    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/missing or invalid audio/i);
  });

  it('returns 400 if audio field is a string instead of a File/Blob', async () => {
    const formData = new FormData();
    formData.append('audio', 'not-a-file');
    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/missing or invalid audio/i);
  });

  it('returns transcript on successful transcription', async () => {
    mockedTranscribe.mockResolvedValue('Hello, how can I help you?');

    const formData = new FormData();
    const audioBlob = new Blob(['fake-audio-data'], {type: 'audio/webm'});
    formData.append('audio', audioBlob, 'recording.webm');

    const request = makeRequest(formData);
    const context = makeContext();
    const response = await action({request, context, params: {} as any});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transcript).toBe('Hello, how can I help you?');
    expect(response.headers.get('Content-Type')).toBe('application/json');

    expect(mockedTranscribe).toHaveBeenCalledWith(
      expect.any(Blob),
      'https://api.openai.com',
      'test-key',
    );
  });

  it('returns 500 when transcription throws an error', async () => {
    mockedTranscribe.mockRejectedValue(new Error('Whisper API error: 503'));

    const formData = new FormData();
    const audioBlob = new Blob(['fake-audio-data'], {type: 'audio/webm'});
    formData.append('audio', audioBlob, 'recording.webm');

    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Whisper API error: 503');
  });

  it('returns generic error message for non-Error exceptions', async () => {
    mockedTranscribe.mockRejectedValue('string error');

    const formData = new FormData();
    const audioBlob = new Blob(['fake-audio-data'], {type: 'audio/webm'});
    formData.append('audio', audioBlob, 'recording.webm');

    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Transcription failed');
  });

  it('response has application/json content-type for all cases', async () => {
    // Success case
    mockedTranscribe.mockResolvedValue('test');
    const formData = new FormData();
    formData.append('audio', new Blob(['data'], {type: 'audio/webm'}), 'audio.webm');
    const request = makeRequest(formData);
    const response = await action({request, context: makeContext(), params: {} as any});
    expect(response.headers.get('Content-Type')).toBe('application/json');

    // Error case
    const emptyFormData = new FormData();
    const errorRequest = makeRequest(emptyFormData);
    const errorResponse = await action({request: errorRequest, context: makeContext(), params: {} as any});
    expect(errorResponse.headers.get('Content-Type')).toBe('application/json');
  });
});
