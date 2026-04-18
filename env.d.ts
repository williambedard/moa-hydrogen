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
    /** OAuth client ID for Customer Account API (from Shopify app TOML or Hydrogen config) */
    CUSTOMER_ACCOUNT_CLIENT_ID?: string;
    /** Origin URL of this storefront (e.g. https://moa-demo.com) — used for OAuth redirect URI */
    CUSTOMER_ACCOUNT_REDIRECT_URI?: string;
  }

  /**
   * Build-SHA marker injected by Vite `define` at build time.
   * Shape: <shortSha>[-dirty]-<epoch>. Also mirrored to window.__BUILD_SHA__
   * for client-side probes. See vite.config.ts buildSha().
   */
  const __BUILD_SHA__: string;

  interface Window {
    __BUILD_SHA__?: string;
  }
}
