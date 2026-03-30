/**
 * API route for text-to-speech synthesis.
 * POST /api/voice-tts
 * Accepts FormData with `text` field.
 * Returns audio/mpeg stream.
 */

import type {Route} from './+types/api.voice-tts';
import {synthesizeSpeech} from '~/lib/voice-services.server';

export async function action({request, context}: Route.ActionArgs): Promise<Response> {
  console.log('[api.voice-tts] Received request');

  const formData = await request.formData();
  const text = String(formData.get('text') || '').trim();

  if (!text) {
    return new Response(
      JSON.stringify({error: 'Missing text field'}),
      {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }

  // Guard against excessively long text (OpenAI TTS limit is 4096 chars)
  if (text.length > 4096) {
    return new Response(
      JSON.stringify({error: 'Text too long (max 4096 characters)'}),
      {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }

  console.log('[api.voice-tts] Text length:', text.length);

  try {
    const {env} = context;
    if (!env.OPENAI_BASE_URL || !env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({error: 'Voice features are not configured'}),
        {status: 501, headers: {'Content-Type': 'application/json'}},
      );
    }
    const audioResponse = await synthesizeSpeech(text, env.OPENAI_BASE_URL, env.OPENAI_API_KEY);

    console.log('[api.voice-tts] TTS response received');

    return new Response(audioResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    console.error('[api.voice-tts] Error:', error);
    return new Response(
      JSON.stringify({error: error instanceof Error ? error.message : 'Speech synthesis failed'}),
      {
        status: 500,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }
}
