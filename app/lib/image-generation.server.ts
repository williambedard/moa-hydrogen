/**
 * Server-side Gemini image generation for curated header backgrounds.
 * Uses Shopify proxy to Vertex AI (gemini-3-pro-image-preview).
 * Edge-compatible: uses only fetch() and Web APIs.
 */

const IMAGE_GENERATION_TIMEOUT_MS = 45_000;

interface GeminiCandidate {
  content: {
    parts: Array<{
      text?: string;
      inlineData?: {mimeType: string; data: string};
      image?: {mimeType: string; data: string};
    }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/**
 * Generate a header background image using Gemini.
 * @returns A data URL on success, null on failure or timeout.
 */
export async function generateHeaderImage(
  prompt: string,
  proxyUrl: string,
  apiKey: string,
): Promise<string | null> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      console.error(`[image-generation] Timed out after ${IMAGE_GENERATION_TIMEOUT_MS}ms`);
      controller.abort();
      resolve(null);
    }, IMAGE_GENERATION_TIMEOUT_MS);
  });

  const request = (async (): Promise<string | null> => {
    try {
      const startTime = Date.now();
      console.log('[image-generation] Sending request to:', proxyUrl);
      console.log('[image-generation] Prompt:', prompt.slice(0, 100));
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{role: 'user', parts: [{text: prompt}]}],
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
        }),
        signal: controller.signal,
      });

      console.log(`[image-generation] Response received in ${Date.now() - startTime}ms, status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          '[image-generation] Gemini API error:',
          response.status,
          errorText,
        );
        return null;
      }

      const data = (await response.json()) as GeminiResponse;

      // Extract base64 image from candidates — Gemini uses either inlineData or image
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) {
        console.error('[image-generation] No parts in Gemini response');
        return null;
      }

      for (const part of parts) {
        const imageData = part.inlineData ?? part.image;
        if (imageData?.data) {
          const mimeType = imageData.mimeType || 'image/png';
          return `data:${mimeType};base64,${imageData.data}`;
        }
      }

      console.error('[image-generation] No image data found in Gemini response');
      return null;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.error('[image-generation] Request aborted (likely timeout)');
      } else {
        console.error('[image-generation] Error generating image:', error);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  return Promise.race([request, timeout]);
}
