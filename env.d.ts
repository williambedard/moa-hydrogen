/// <reference types="vite/client" />
/// <reference types="react-router" />
/// <reference types="@shopify/oxygen-workers-types" />
/// <reference types="@shopify/hydrogen/react-router-types" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

// Extend Env interface to add custom environment variables
declare global {
  interface Env {
    AI_API_KEY: string;
    AI_BASE_URL: string;
    AI_MODEL: string;
    /** Optional password for password-protected storefronts */
    STORE_PASSWORD?: string;
    /** Enable extended thinking mode for AI (optional) */
    ENABLE_EXTENDED_THINKING?: string;
    /** OpenAI API proxy base URL (for voice STT/TTS) */
    OPENAI_BASE_URL?: string;
    /** OpenAI API key (for voice STT/TTS) */
    OPENAI_API_KEY?: string;
    /** Image generation proxy URL (Shopify proxy to Vertex AI Gemini) */
    IMAGE_GENERATION_URL?: string;
    /** Set to "true" to disable AI header image generation */
    DISABLE_IMAGE_GENERATION?: string;
  }
}
