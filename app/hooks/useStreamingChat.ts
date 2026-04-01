/**
 * Client-side hook for consuming Server-Sent Events from the AI streaming endpoint.
 */

import {useState, useCallback, useRef, useEffect} from 'react';
import type {ContextUpdate} from '~/lib/shopping-context';
import type {IntentResult} from '~/lib/intent-types';

export interface ToolCallInfo {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'complete' | 'error';
}

export interface EnrichedProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  url: string;
  price: string;
  compareAtPrice?: string;
  image_url?: string;
  images: string[];
  vendor?: string;
  productType?: string;
  tags: string[];
  availableForSale: boolean;
  options?: Array<{name: string; values: string[]}>;
  variants?: Array<{
    id: string;
    title: string;
    availableForSale: boolean;
    price: string;
    compareAtPrice?: string;
    selectedOptions: Array<{name: string; value: string}>;
    image?: {url: string; altText?: string};
  }>;
}

export interface CuratedHeader {
  title: string;
  subtitle: string;
  imageUrl?: string;
}

// Re-export for convenience
export type { CuratedHeader as CuratedHeaderState };

/** Ordered content block — text and tool calls interleaved in stream order. */
export type ContentBlock =
  | {type: 'text'; text: string}
  | {type: 'tool'; toolCall: ToolCallInfo};

type StreamEvent =
  | {type: 'stream_start'}
  | {type: 'text_delta'; delta: string}
  | {type: 'tool_use_start'; id: string; tool: string; params: Record<string, unknown>}
  | {type: 'tool_use_end'; id: string; tool: string; result: string}
  | {type: 'curated_products'; products: EnrichedProduct[]}
  | {type: 'curated_products_header'; title: string; subtitle: string; imageUrl?: string}
  | {type: 'suggested_prompts'; prompts: string[]}
  | {type: 'context_update'; update: ContextUpdate}
  | {type: 'thinking_delta'; delta: string}
  | {type: 'intent'; intent: IntentResult}
  | {type: 'cart_updated'; cartId: string}
  | {type: 'auth_required'; loginUrl: string}
  | {type: 'done'; fullText: string; toolCalls: ToolCallInfo[]}
  | {type: 'error'; message: string};

export interface StreamingState {
  isStreaming: boolean;
  isConnected: boolean;     // True once stream_start SSE event received
  streamedText: string;
  thinkingText: string;
  /** Ordered content blocks — text and tool calls in stream order. */
  contentBlocks: ContentBlock[];
  /** Flat tool call list for quick lookups (mirrors tool blocks in contentBlocks). */
  toolCalls: ToolCallInfo[];
  products: EnrichedProduct[] | null;
  curatedHeader: CuratedHeader | null;
  suggestedPrompts: string[] | null;
  contextUpdate: ContextUpdate | null;
  intent: IntentResult | null;
  cartId: string | null;
  /** Customer account login required — set when agent needs account access */
  authRequired: boolean;
  loginUrl: string | null;
  error: string | null;
  fullText: string | null;
}

interface UseStreamingChatReturn {
  state: StreamingState;
  startStream: (formData: FormData) => Promise<void>;
  reset: () => void;
}

const initialState: StreamingState = {
  isStreaming: false,
  isConnected: false,
  authRequired: false,
  loginUrl: null,
  streamedText: '',
  thinkingText: '',
  contentBlocks: [],
  toolCalls: [],
  products: null,
  curatedHeader: null,
  suggestedPrompts: null,
  contextUpdate: null,
  intent: null,
  cartId: null,
  error: null,
  fullText: null,
};

export function useStreamingChat(): UseStreamingChatReturn {
  const [state, setState] = useState<StreamingState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Store the last submitted FormData so we can retry after auth. */
  const lastFormDataRef = useRef<FormData | null>(null);
  const startStreamRef = useRef<((formData: FormData) => Promise<void>) | null>(null);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    lastFormDataRef.current = null;
    setState(initialState);
  }, []);

  // Listen for auth completion from the login popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'moa_auth_complete') {
        console.log('[useStreamingChat] Auth completed, retrying last query');
        setState((prev) => ({...prev, authRequired: false, loginUrl: null}));
        // Re-submit the last query now that the customer is authenticated
        const lastFormData = lastFormDataRef.current;
        if (lastFormData && startStreamRef.current) {
          startStreamRef.current(lastFormData);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const startStream = useCallback(async (formData: FormData) => {
    lastFormDataRef.current = formData;
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState({
      ...initialState,
      isStreaming: true,
    });

    try {
      console.log('[useStreamingChat] Starting stream request');
      const response = await fetch('/api/ai-stream', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      console.log('[useStreamingChat] Response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[useStreamingChat] Error response:', text);
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          console.log('[useStreamingChat] Stream done');
          break;
        }

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data) as StreamEvent;
              console.log('[useStreamingChat] Event:', event.type);
              handleEvent(event, setState);
            } catch (e) {
              console.warn('[useStreamingChat] Failed to parse event:', data, e);
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        if (data !== '[DONE]') {
          try {
            const event = JSON.parse(data) as StreamEvent;
            console.log('[useStreamingChat] Final event:', event.type);
            handleEvent(event, setState);
          } catch {
            // Invalid JSON, skip
          }
        }
      }
    } catch (error) {
      console.error('[useStreamingChat] Stream error:', error);
      if ((error as Error).name === 'AbortError') {
        // Stream was intentionally aborted
        return;
      }
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: error instanceof Error ? error.message : 'Stream error',
      }));
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  // Keep startStream ref updated for the postMessage handler
  startStreamRef.current = startStream;

  return {state, startStream, reset};
}

function handleEvent(
  event: StreamEvent,
  setState: React.Dispatch<React.SetStateAction<StreamingState>>,
): void {
  switch (event.type) {
    case 'stream_start':
      setState((prev) => ({
        ...prev,
        isConnected: true,
      }));
      break;

    case 'text_delta':
      setState((prev) => {
        const blocks = [...prev.contentBlocks];
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === 'text') {
          // Append to the current text block
          blocks[blocks.length - 1] = {type: 'text', text: lastBlock.text + event.delta};
        } else {
          // Start a new text block (first content, or after a tool)
          blocks.push({type: 'text', text: event.delta});
        }
        return {
          ...prev,
          streamedText: prev.streamedText + event.delta,
          contentBlocks: blocks,
        };
      });
      break;

    case 'thinking_delta':
      setState((prev) => ({
        ...prev,
        thinkingText: prev.thinkingText + event.delta,
      }));
      break;

    case 'tool_use_start': {
      const newToolCall: ToolCallInfo = {
        id: event.id,
        tool: event.tool,
        params: event.params,
        status: 'pending',
      };
      setState((prev) => ({
        ...prev,
        toolCalls: [...prev.toolCalls, newToolCall],
        contentBlocks: [...prev.contentBlocks, {type: 'tool', toolCall: newToolCall}],
      }));
      break;
    }

    case 'tool_use_end':
      setState((prev) => {
        const updatedToolCall = (tc: ToolCallInfo): ToolCallInfo =>
          tc.id === event.id
            ? {...tc, result: event.result, status: 'complete' as const}
            : tc;
        return {
          ...prev,
          toolCalls: prev.toolCalls.map(updatedToolCall),
          contentBlocks: prev.contentBlocks.map((b) =>
            b.type === 'tool' && b.toolCall.id === event.id
              ? {type: 'tool', toolCall: updatedToolCall(b.toolCall)}
              : b,
          ),
        };
      });
      break;

    case 'curated_products':
      console.log('[useStreamingChat] Received curated_products event:', event.products.length, 'products');
      setState((prev) => ({
        ...prev,
        products: event.products,
      }));
      break;

    case 'curated_products_header':
      console.log('[useStreamingChat] Received curated_products_header event:', event.title);
      setState((prev) => ({
        ...prev,
        curatedHeader: {title: event.title, subtitle: event.subtitle, imageUrl: event.imageUrl},
      }));
      break;

    case 'suggested_prompts':
      console.log('[useStreamingChat] Received suggested_prompts event:', event.prompts);
      setState((prev) => ({
        ...prev,
        suggestedPrompts: event.prompts,
      }));
      break;

    case 'context_update':
      setState((prev) => ({
        ...prev,
        contextUpdate: event.update,
      }));
      break;

    case 'intent':
      setState((prev) => ({
        ...prev,
        intent: event.intent,
      }));
      break;

    case 'cart_updated':
      console.log('[useStreamingChat] Cart updated:', event.cartId);
      setState((prev) => ({
        ...prev,
        cartId: event.cartId,
      }));
      break;

    case 'auth_required':
      console.log('[useStreamingChat] Customer auth required, login URL:', event.loginUrl);
      setState((prev) => ({
        ...prev,
        authRequired: true,
        loginUrl: event.loginUrl,
      }));
      // Open login popup
      openAuthPopup(event.loginUrl);
      break;

    case 'done':
      setState((prev) => {
        // Merge server tool calls with client-tracked ones instead of replacing.
        const mergedToolCalls = [...prev.toolCalls];
        const knownIds = new Set(mergedToolCalls.map((tc) => tc.id));
        for (const serverTc of event.toolCalls) {
          if (!knownIds.has(serverTc.id)) {
            mergedToolCalls.push(serverTc);
          }
        }
        // Also merge into contentBlocks — add any server-only tools at the end
        const blockKnownIds = new Set(
          prev.contentBlocks
            .filter((b): b is Extract<ContentBlock, {type: 'tool'}> => b.type === 'tool')
            .map((b) => b.toolCall.id),
        );
        const newBlocks = [...prev.contentBlocks];
        for (const serverTc of event.toolCalls) {
          if (!blockKnownIds.has(serverTc.id)) {
            newBlocks.push({type: 'tool', toolCall: serverTc});
          }
        }
        return {
          ...prev,
          fullText: event.fullText,
          toolCalls: mergedToolCalls,
          contentBlocks: newBlocks,
          isStreaming: false,
        };
      });
      break;

    case 'error':
      setState((prev) => ({
        ...prev,
        error: event.message,
        isStreaming: false,
      }));
      break;
  }
}

/**
 * Open the Customer Account login page in a popup window.
 * The popup will post a message back when auth completes.
 */
function openAuthPopup(loginUrl: string): void {
  const width = 500;
  const height = 600;
  const left = window.screenX + (window.innerWidth - width) / 2;
  const top = window.screenY + (window.innerHeight - height) / 2;

  window.open(
    loginUrl,
    'moa-auth',
    `width=${width},height=${height},left=${left},top=${top},popup=true`,
  );
}
