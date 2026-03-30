import {useState, useEffect, useCallback, useRef} from 'react';
import type {
  Conversation,
  ConversationMessage,
  ConversationResults,
  ToolCallRecord,
  ContentBlock,
} from '~/lib/conversation-storage.client';
import type {ShoppingContext, ContextUpdate} from '~/lib/shopping-context';
import {mergeContextUpdate} from '~/lib/shopping-context';

const MAX_HISTORY_PAIRS = 10;

// Generate conversation ID synchronously (doesn't need storage module)
function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface AddAssistantMessageOptions {
  toolCalls?: ToolCallRecord[];
  thinkingText?: string;
  contentBlocks?: ContentBlock[];
}

interface UseConversationReturn {
  conversationId: string | null;
  messages: ConversationMessage[];
  lastResults: ConversationResults | null;
  shoppingContext: ShoppingContext | null;
  addUserMessage: (content: string, productId?: string) => void;
  addAssistantMessage: (content: string, options?: AddAssistantMessageOptions) => void;
  saveResults: (results: ConversationResults) => void;
  updateShoppingContext: (update: ContextUpdate) => void;
  startNewConversation: () => void;
  getHistoryForSubmission: (currentProductId?: string | null) => string;
  getContextForSubmission: () => string;
  hasHistory: boolean;
}

export function useConversation(): UseConversationReturn {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [lastResults, setLastResults] = useState<ConversationResults | null>(null);
  const [shoppingContext, setShoppingContext] = useState<ShoppingContext | null>(null);
  const storageRef = useRef<typeof import('~/lib/conversation-storage.client') | null>(null);
  const isInitialized = useRef(false);

  // Load storage module and initialize
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const storage = await import('~/lib/conversation-storage.client');
        if (!mounted) return;

        storageRef.current = storage;

        // Cleanup old conversations on init
        await storage.cleanupOldConversations();

        // Check for existing conversation in session storage
        const storedId = sessionStorage.getItem('ai-conversation-id');
        if (storedId) {
          const conversation = await storage.getConversation(storedId);
          if (conversation && mounted) {
            setConversationId(conversation.id);
            setMessages(conversation.messages);
            if (conversation.lastResults) {
              setLastResults(conversation.lastResults);
            }
            if (conversation.shoppingContext) {
              setShoppingContext(conversation.shoppingContext);
            }
          }
        }

        isInitialized.current = true;
      } catch (error) {
        console.warn('Failed to initialize conversation storage:', error);
      }
    }

    void init();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist conversation when messages, results, or context change
  useEffect(() => {
    if (!conversationId) return;
    if (messages.length === 0 && !lastResults && !shoppingContext) return;

    const storage = storageRef.current;
    if (!storage) {
      // Storage not ready yet - retry after a short delay
      const timeout = setTimeout(() => {
        const retryStorage = storageRef.current;
        if (retryStorage && conversationId) {
          const conversation: Conversation = {
            id: conversationId,
            createdAt: messages[0]?.timestamp || Date.now(),
            updatedAt: Date.now(),
            messages,
            lastResults: lastResults || undefined,
            shoppingContext: shoppingContext || undefined,
          };
          void retryStorage.saveConversation(conversation);
        }
      }, 500);
      return () => clearTimeout(timeout);
    }

    const conversation: Conversation = {
      id: conversationId,
      createdAt: messages[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
      messages,
      lastResults: lastResults || undefined,
      shoppingContext: shoppingContext || undefined,
    };

    void storage.saveConversation(conversation);
  }, [conversationId, messages, lastResults, shoppingContext]);

  const addUserMessage = useCallback((content: string, productId?: string) => {
    // Create new conversation if needed (synchronously, no storage dependency)
    let currentId = conversationId;
    if (!currentId) {
      currentId = generateConversationId();
      setConversationId(currentId);
      sessionStorage.setItem('ai-conversation-id', currentId);
    }

    const message: ConversationMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
      productId,
    };

    setMessages((prev) => [...prev, message]);
  }, [conversationId]);

  const addAssistantMessage = useCallback((content: string, options?: AddAssistantMessageOptions) => {
    const message: ConversationMessage = {
      role: 'assistant',
      content,
      contentBlocks: options?.contentBlocks,
      timestamp: Date.now(),
      toolCalls: options?.toolCalls,
      thinkingText: options?.thinkingText,
    };

    setMessages((prev) => [...prev, message]);
  }, []);

  const saveResults = useCallback((results: ConversationResults) => {
    // Create new conversation if needed (synchronously, no storage dependency)
    let currentId = conversationId;
    if (!currentId) {
      currentId = generateConversationId();
      setConversationId(currentId);
      sessionStorage.setItem('ai-conversation-id', currentId);
    }

    setLastResults(results);
  }, [conversationId]);

  const updateShoppingContext = useCallback((update: ContextUpdate) => {
    // Create new conversation if needed
    let currentId = conversationId;
    if (!currentId) {
      currentId = generateConversationId();
      setConversationId(currentId);
      sessionStorage.setItem('ai-conversation-id', currentId);
    }

    setShoppingContext((prev) => mergeContextUpdate(prev, update));
  }, [conversationId]);

  const startNewConversation = useCallback(() => {
    const storage = storageRef.current;

    // Delete old conversation from IndexedDB
    if (conversationId && storage) {
      void storage.deleteConversation(conversationId);
    }

    // Clear state
    setConversationId(null);
    setMessages([]);
    setLastResults(null);
    setShoppingContext(null);
    sessionStorage.removeItem('ai-conversation-id');
  }, [conversationId]);

  const getHistoryForSubmission = useCallback((currentProductId?: string | null): string => {
    if (messages.length === 0) return '';

    // Limit to most recent message pairs
    const recentMessages = messages.slice(-(MAX_HISTORY_PAIRS * 2));

    // Format for server: simple JSON array
    const historyArray: {role: string; content: string}[] = [];

    // Find the last product ID discussed in history (from user messages)
    const lastProductIdInHistory = [...recentMessages]
      .reverse()
      .find((m) => m.role === 'user' && m.productId)?.productId;

    // If the user switched products since the last message, inject an annotation
    // so the AI knows to focus on the new product and disregard old product details
    if (
      currentProductId &&
      lastProductIdInHistory &&
      currentProductId !== lastProductIdInHistory
    ) {
      for (const m of recentMessages) {
        historyArray.push({role: m.role, content: m.content});
      }
      historyArray.push({
        role: 'user',
        content:
          '[System note: The user has switched to viewing a different product. The <current_product> block in the system prompt reflects the new product. Disregard product-specific details (price, options, availability, descriptions) from earlier messages that refer to a different product.]',
      });
    } else {
      for (const m of recentMessages) {
        historyArray.push({role: m.role, content: m.content});
      }
    }

    return JSON.stringify(historyArray);
  }, [messages]);

  const getContextForSubmission = useCallback((): string => {
    if (!shoppingContext) return '';
    return JSON.stringify(shoppingContext);
  }, [shoppingContext]);

  return {
    conversationId,
    messages,
    lastResults,
    shoppingContext,
    addUserMessage,
    addAssistantMessage,
    saveResults,
    updateShoppingContext,
    startNewConversation,
    getHistoryForSubmission,
    getContextForSubmission,
    hasHistory: messages.length > 0,
  };
}
