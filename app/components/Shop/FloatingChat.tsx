/**
 * Floating chat widget for non-homepage pages.
 * Renders ConciergePrompt in widget mode (fixed bottom-right).
 * Wraps itself in ConversationProvider so conversation persists via IndexedDB.
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import {useRevalidator} from 'react-router';
import {ConciergePrompt} from './ConciergePrompt';
import {
  ConversationProvider,
  useConversationContext,
} from '~/components/ConversationProvider';
import {useStreamingChat} from '~/hooks/useStreamingChat';
import {ClientOnly} from '~/components/ClientOnly';

export function FloatingChat() {
  return (
    <ClientOnly fallback={null}>
      <ConversationProvider>
        <FloatingChatInner />
      </ConversationProvider>
    </ClientOnly>
  );
}

function FloatingChatInner() {
  const {
    messages,
    addUserMessage,
    addAssistantMessage,
    updateShoppingContext,
    startNewConversation,
    getHistoryForSubmission,
    getContextForSubmission,
    hasHistory,
  } = useConversationContext();

  const {state, startStream, reset} = useStreamingChat();
  const {revalidate} = useRevalidator();

  // Handle streaming completion — save even if fullText is empty
  // (the AI may respond with only tool calls / products and no prose)
  useEffect(() => {
    const hasContent = state.fullText || (state.products && state.products.length > 0) || state.toolCalls.length > 0;
    if (hasContent && !state.isStreaming) {
      addAssistantMessage(state.fullText || '', {
        toolCalls: state.toolCalls.length > 0 ? state.toolCalls : undefined,
        thinkingText: state.thinkingText || undefined,
        contentBlocks: state.contentBlocks.length > 0 ? state.contentBlocks : undefined,
        products: state.products && state.products.length > 0
          ? state.products.map((p) => ({
              id: p.id,
              handle: p.handle,
              title: p.title,
              description: p.description,
              url: p.url,
              price: p.price,
              compareAtPrice: p.compareAtPrice,
              image_url: p.image_url,
              images: p.images,
              availableForSale: p.availableForSale,
              variants: p.variants?.map((v) => ({
                id: v.id,
                title: v.title,
                availableForSale: v.availableForSale,
                price: v.price,
              })),
            }))
          : undefined,
      });

      if (state.contextUpdate) {
        updateShoppingContext(state.contextUpdate);
      }

      if (state.cartId) {
        fetch('/api/cart-sync', {
          method: 'POST',
          body: new URLSearchParams({cartId: state.cartId}),
        })
          .then((res) => res.json())
          .then(() => revalidate())
          .catch((err) => console.error('[FloatingChat] Cart sync error:', err));
      }
    }
  }, [
    state.fullText,
    state.isStreaming,
    state.products,
    state.contextUpdate,
    state.error,
    state.toolCalls,
    state.thinkingText,
    state.cartId,
    addAssistantMessage,
    updateShoppingContext,
    revalidate,
  ]);

  const handleSubmit = useCallback(
    (formData: FormData) => {
      const query = formData.get('query')?.toString().trim();
      if (!query) return;

      addUserMessage(query);

      const streamFormData = new FormData();
      streamFormData.set('query', query);
      streamFormData.set('history', getHistoryForSubmission());
      streamFormData.set('shoppingContext', getContextForSubmission());

      void startStream(streamFormData);
    },
    [addUserMessage, getHistoryForSubmission, getContextForSubmission, startStream],
  );

  const handleNewChat = useCallback(() => {
    reset();
    startNewConversation();
  }, [reset, startNewConversation]);

  return (
    <ConciergePrompt
      isLoading={false}
      historyJson={getHistoryForSubmission()}
      shoppingContextJson={getContextForSubmission()}
      productContextJson=""
      messages={messages}
      hasHistory={hasHistory}
      onNewChat={handleNewChat}
      onSubmit={handleSubmit}
      streamingText={state.streamedText}
      streamingContentBlocks={state.contentBlocks}
      streamingThinkingText={state.thinkingText}
      isStreaming={state.isStreaming}
      suggestedPrompts={state.suggestedPrompts}
      isInHero={false}
      authRequired={state.authRequired}
    />
  );
}
