/**
 * API route for speech-to-text transcription.
 * POST /api/voice-stt
 * Accepts FormData with `audio` field (File/Blob).
 * Returns { transcript: string } JSON.
 */

import type {Route} from './+types/api.voice-stt';
import {transcribeAudio} from '~/lib/voice-services.server';

export async function action({request, context}: Route.ActionArgs): Promise<Response> {
  console.log('[api.voice-stt] Received request');

  const formData = await request.formData();
  const audioFile = formData.get('audio');

  if (!audioFile || !(audioFile instanceof File || audioFile instanceof Blob)) {
    return new Response(
      JSON.stringify({error: 'Missing or invalid audio field'}),
      {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }

  console.log('[api.voice-stt] Audio size:', (audioFile as Blob).size, 'bytes');

  try {
    const {env} = context;
    if (!env.OPENAI_BASE_URL || !env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({error: 'Voice features are not configured'}),
        {status: 501, headers: {'Content-Type': 'application/json'}},
      );
    }
    const transcript = await transcribeAudio(audioFile as Blob, env.OPENAI_BASE_URL, env.OPENAI_API_KEY);

    console.log('[api.voice-stt] Transcription complete:', transcript.substring(0, 100));

    return new Response(
      JSON.stringify({transcript}),
      {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      },
    );
  } catch (error) {
    console.error('[api.voice-stt] Error:', error);
    return new Response(
      JSON.stringify({error: error instanceof Error ? error.message : 'Transcription failed'}),
      {
        status: 500,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }
}
