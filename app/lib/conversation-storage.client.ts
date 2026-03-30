/**
 * IndexedDB-based conversation storage for AI chat history.
 * Client-only module - must be imported dynamically or in client components.
 */

import type {ShoppingContext} from './shopping-context';

const DB_NAME = 'ai-shopping-conversations';
const DB_VERSION = 2;
const STORE_NAME = 'conversations';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ToolCallRecord {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'complete' | 'error';
}

/** Ordered content block — text and tool calls interleaved in stream order. */
export type ContentBlock =
  | {type: 'text'; text: string}
  | {type: 'tool'; toolCall: ToolCallRecord};

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Ordered sequence of text and tool-call blocks (replaces preToolText/postToolText). */
  contentBlocks?: ContentBlock[];
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  thinkingText?: string;
  /** Product ID the user was viewing when this message was sent (user messages only). */
  productId?: string;
}

export interface ConversationResults {
  products: unknown[];
  heroContent: {
    title: string;
    subtitle: string;
    imageUrl?: string;
  };
  query: string;
}

export interface Conversation {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
  lastResults?: ConversationResults;
  shoppingContext?: ShoppingContext;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {keyPath: 'id'});
        store.createIndex('updatedAt', 'updatedAt', {unique: false});
      }
    };
  });

  return dbPromise;
}

export async function saveConversation(
  conversation: Conversation,
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(conversation);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('Failed to save conversation to IndexedDB:', error);
  }
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.warn('Failed to get conversation from IndexedDB:', error);
    return null;
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('Failed to delete conversation from IndexedDB:', error);
  }
}

export async function cleanupOldConversations(): Promise<void> {
  try {
    const db = await openDatabase();
    const cutoffTime = Date.now() - MAX_AGE_MS;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('updatedAt');
      const range = IDBKeyRange.upperBound(cutoffTime);
      const request = index.openCursor(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  } catch (error) {
    console.warn('Failed to cleanup old conversations:', error);
  }
}

export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
