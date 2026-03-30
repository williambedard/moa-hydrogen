/**
 * Server-side utilities for OpenAI voice APIs (STT and TTS).
 * Edge-compatible: uses only fetch() and Web APIs.
 */

/**
 * Transcribe audio using OpenAI Whisper API.
 * @returns The transcribed text.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  baseURL: string,
  apiKey: string,
): Promise<string> {
  // Derive filename extension from MIME type so Whisper correctly identifies the format
  // Safari records as audio/mp4, Chrome/Firefox as audio/webm
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const formData = new FormData();
  formData.append('file', audioBlob, `audio.${ext}`);
  formData.append('model', 'whisper-1');

  const response = await fetch(`${baseURL}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[voice-services] Whisper API error:', response.status, errorText);
    throw new Error(`Whisper API error: ${response.status}`);
  }

  const data = (await response.json()) as {text: string};
  return data.text;
}

/**
 * Synthesize speech using OpenAI TTS API.
 * @returns A Response with audio/mpeg body stream.
 */
export async function synthesizeSpeech(
  text: string,
  baseURL: string,
  apiKey: string,
): Promise<Response> {
  const response = await fetch(`${baseURL}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'fable',
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[voice-services] TTS API error:', response.status, errorText);
    throw new Error(`TTS API error: ${response.status}`);
  }

  return response;
}
