/**
 * Tests for useConversation hook — specifically the getHistoryForSubmission method
 * and how conversation history interacts with product context changes.
 *
 * Key behaviors under test:
 * 1. getHistoryForSubmission returns JSON array of {role, content} pairs
 * 2. History is limited to MAX_HISTORY_PAIRS (10 pairs = 20 messages)
 * 3. History is returned as plain text (no product context metadata embedded)
 * 4. Product context switching is handled by the system prompt, not by rewriting history
 *
 * Note: The main protection against stale product context in history is in the
 * system prompt (buildSystemPrompt) which instructs Claude to disregard product
 * details from history that refer to a different product than <current_product>.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useConversation} from '~/hooks/useConversation';

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(mockSessionStorage).forEach(
    (key) => delete mockSessionStorage[key],
  );
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => mockSessionStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockSessionStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockSessionStorage[key];
    },
  });
});

describe('useConversation — getHistoryForSubmission', () => {
  it('returns empty string when no messages', () => {
    const {result} = renderHook(() => useConversation());
    expect(result.current.getHistoryForSubmission()).toBe('');
  });

  it('returns JSON array of {role, content} pairs', () => {
    const {result} = renderHook(() => useConversation());

    act(() => {
      result.current.addUserMessage('Show me red shoes');
    });
    act(() => {
      result.current.addAssistantMessage(
        'Here are some beautiful red shoes for you!',
      );
    });

    const history = result.current.getHistoryForSubmission();
    const parsed = JSON.parse(history) as Array<{
      role: string;
      content: string;
    }>;

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      role: 'user',
      content: 'Show me red shoes',
    });
    expect(parsed[1]).toEqual({
      role: 'assistant',
      content: 'Here are some beautiful red shoes for you!',
    });
  });

  it('limits history to MAX_HISTORY_PAIRS (20 messages)', () => {
    const {result} = renderHook(() => useConversation());

    // Add 12 pairs = 24 messages (exceeds the 10-pair limit)
    for (let i = 0; i < 12; i++) {
      act(() => {
        result.current.addUserMessage(`User message ${i}`);
      });
      act(() => {
        result.current.addAssistantMessage(`Assistant message ${i}`);
      });
    }

    const history = result.current.getHistoryForSubmission();
    const parsed = JSON.parse(history) as Array<{
      role: string;
      content: string;
    }>;

    // Should be limited to 20 (10 pairs)
    expect(parsed.length).toBeLessThanOrEqual(20);
    // Last message should be from the most recent pair
    expect(parsed[parsed.length - 1].content).toBe('Assistant message 11');
  });

  it('includes only role and content, not metadata like toolCalls', () => {
    const {result} = renderHook(() => useConversation());

    act(() => {
      result.current.addUserMessage('Add that to my cart');
    });
    act(() => {
      result.current.addAssistantMessage("I've added it to your cart!", {
        toolCalls: [
          {
            name: 'update_cart',
            input: {variant_id: 'v1'},
            result: '{"cart_id": "c1"}',
          },
        ],
      });
    });

    const history = result.current.getHistoryForSubmission();
    const parsed = JSON.parse(history) as Array<Record<string, unknown>>;

    // Each entry should only have role and content
    for (const entry of parsed) {
      expect(Object.keys(entry).sort()).toEqual(['content', 'role']);
    }
    // Should not include tool call info
    expect(history).not.toContain('update_cart');
    expect(history).not.toContain('variant_id');
  });

  describe('product context switching scenario', () => {
    it('history contains raw text from all products discussed', () => {
      // This test demonstrates the "problem" scenario: history will contain
      // references to Product A even when the user has switched to Product B.
      // The FIX is in the system prompt, which tells Claude to disregard
      // product details from history that differ from <current_product>.
      const {result} = renderHook(() => useConversation());

      // User asks about Product A
      act(() => {
        result.current.addUserMessage(
          'Tell me about the Classic Leather Loafers',
        );
      });
      act(() => {
        result.current.addAssistantMessage(
          'The Classic Leather Loafers are priced at GBP 89.00, available in sizes 6-10 and in Black, Brown, and Tan.',
        );
      });

      // User switches to Product B and asks
      act(() => {
        result.current.addUserMessage(
          'What about this product?',
        );
      });
      act(() => {
        result.current.addAssistantMessage(
          'The Suede Chelsea Boots are priced at GBP 129.00, available in sizes 7-11.',
        );
      });

      const history = result.current.getHistoryForSubmission();
      const parsed = JSON.parse(history) as Array<{
        role: string;
        content: string;
      }>;

      // History contains messages about BOTH products
      expect(parsed).toHaveLength(4);
      expect(history).toContain('Classic Leather Loafers');
      expect(history).toContain('Suede Chelsea Boots');

      // The system prompt (tested in build-system-prompt.test.ts) is responsible
      // for instructing Claude to prioritize <current_product> over this history
    });
  });

  describe('startNewConversation', () => {
    it('clears all messages and context', () => {
      const {result} = renderHook(() => useConversation());

      act(() => {
        result.current.addUserMessage('Show me shoes');
      });
      act(() => {
        result.current.addAssistantMessage('Here are some shoes!');
      });

      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.startNewConversation();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.getHistoryForSubmission()).toBe('');
      expect(result.current.shoppingContext).toBeNull();
    });
  });

  describe('addUserMessage with productId', () => {
    it('stores the productId on the message when provided', () => {
      const {result} = renderHook(() => useConversation());

      act(() => {
        result.current.addUserMessage('Tell me about this', 'product-123');
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].productId).toBe('product-123');
    });

    it('stores no productId when not provided', () => {
      const {result} = renderHook(() => useConversation());

      act(() => {
        result.current.addUserMessage('Show me shoes');
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].productId).toBeUndefined();
    });
  });

  describe('product switch annotation in getHistoryForSubmission', () => {
    const ANNOTATION_SNIPPET = 'The user has switched to viewing a different product';

    it('injects annotation when currentProductId differs from last productId in history', () => {
      const {result} = renderHook(() => useConversation());

      act(() => {
        result.current.addUserMessage('Tell me about this shoe', 'product-A-id');
      });
      act(() => {
        result.current.addAssistantMessage('The Classic Leather Loafers are GBP 89.');
      });
      act(() => {
        result.current.addUserMessage('What about this one?', 'product-B-id');
      });
      act(() => {
        result.current.addAssistantMessage('The Suede Chelsea Boots are GBP 129.');
      });

      const history = result.current.getHistoryForSubmission('product-B-id');
      // Last productId in history is 'product-B-id', same as currentProductId
      // so no annotation expected here. Let's test the actual switch case:
      // User was viewing product-B last, now switches to product-C
      const historyAfterSwitch = result.current.getHistoryForSubmission('product-C-id');
      expect(historyAfterSwitch).toContain(ANNOTATION_SNIPPET);

      const parsed = JSON.parse(historyAfterSwitch) as Array<{role: string; content: string}>;
      // The annotation should be the last entry
      expect(parsed[parsed.length - 1].content).toContain(ANNOTATION_SNIPPET);
      expect(parsed[parsed.length - 1].role).toBe('user');
    });

    it('does not inject annotation when currentProductId matches last productId in history', () => {
      const {result} = renderHook(() => useConversation());

      act(() => {
        result.current.addUserMessage('Tell me about this', 'product-A-id');
      });
      act(() => {
        result.current.addAssistantMessage('Here is some info.');
      });

      const history = result.current.getHistoryForSubmission('product-A-id');
      expect(history).not.toContain(ANNOTATION_SNIPPET);
    });

    it('does not inject annotation when no currentProductId is passed', () => {
      const {result} = renderHook(() => useConversation());

      act(() => {
        result.current.addUserMessage('Tell me about this', 'product-A-id');
      });
      act(() => {
        result.current.addAssistantMessage('Here is some info.');
      });

      // No argument
      const history1 = result.current.getHistoryForSubmission();
      expect(history1).not.toContain(ANNOTATION_SNIPPET);

      // Null argument
      const history2 = result.current.getHistoryForSubmission(null);
      expect(history2).not.toContain(ANNOTATION_SNIPPET);
    });

    it('does not inject annotation when no previous productId exists in history', () => {
      const {result} = renderHook(() => useConversation());

      // Messages without productId
      act(() => {
        result.current.addUserMessage('Show me red shoes');
      });
      act(() => {
        result.current.addAssistantMessage('Here are some red shoes!');
      });

      const history = result.current.getHistoryForSubmission('product-X-id');
      expect(history).not.toContain(ANNOTATION_SNIPPET);
    });
  });

  describe('hasHistory', () => {
    it('is false when no messages', () => {
      const {result} = renderHook(() => useConversation());
      expect(result.current.hasHistory).toBe(false);
    });

    it('is true after adding a message', () => {
      const {result} = renderHook(() => useConversation());
      act(() => {
        result.current.addUserMessage('Hello');
      });
      expect(result.current.hasHistory).toBe(true);
    });
  });
});
