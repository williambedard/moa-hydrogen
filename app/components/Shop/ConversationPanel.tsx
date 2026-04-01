import {useRef, useEffect} from 'react';
import {motion, AnimatePresence, useReducedMotion} from 'framer-motion';
import type {ConversationMessage} from '~/lib/conversation-storage.client';
import type {ContentBlock} from '~/hooks/useStreamingChat';
import {MessageBubble} from './MessageBubble';
import {ConciergeAvatar} from './ConciergeAvatar';

interface ConversationPanelProps {
  messages: ConversationMessage[];
  isOpen: boolean;
  onClose: () => void;
  // Streaming state for current message
  streamingText?: string;
  streamingContentBlocks?: ContentBlock[];
  streamingThinkingText?: string;
  isStreaming?: boolean;
  /** Customer account login required — shows login indicator in chat */
  authRequired?: boolean;
}

function ThinkingIndicator({reduceMotion}: {reduceMotion: boolean | null}) {
  return (
    <div className="flex gap-3 flex-row">
      {/* Avatar — matches MessageBubble assistant layout */}
      <div className="shrink-0">
        <div className="w-8 h-8 rounded-full overflow-hidden">
          <ConciergeAvatar size={32} />
        </div>
      </div>

      {/* Bubble — left-aligned, not flex-1 */}
      <div>
        <div className="inline-flex items-center gap-1.5 bg-[var(--moa-surface)] text-[var(--moa-text)] rounded-2xl rounded-tl-sm border border-[var(--moa-border)] px-4 py-3">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block w-1.5 h-1.5 rounded-full bg-[var(--moa-accent)]"
              animate={reduceMotion ? {} : {y: [0, -4, 0]}}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AuthRequiredIndicator() {
  return (
    <div className="flex gap-3 flex-row">
      <div className="shrink-0">
        <div className="w-8 h-8 rounded-full overflow-hidden">
          <ConciergeAvatar size={32} />
        </div>
      </div>
      <div>
        <div className="inline-flex items-center gap-2 bg-[var(--moa-surface)] text-[var(--moa-text-secondary)] rounded-2xl rounded-tl-sm border border-[var(--moa-accent)]/30 px-4 py-3 text-sm">
          <svg className="w-4 h-4 text-[var(--moa-accent)] shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
          </svg>
          Waiting for login...
        </div>
      </div>
    </div>
  );
}

export function ConversationPanel({
  messages,
  isOpen,
  onClose,
  streamingText,
  streamingContentBlocks,
  streamingThinkingText,
  isStreaming,
  authRequired,
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Show thinking indicator until actual text starts streaming.
  // Tool-only content blocks don't count — they're invisible to the user now.
  const hasVisibleStreamingText = !!(streamingText && streamingText.length > 0);
  const hasStreamingContent = hasVisibleStreamingText || !!(streamingContentBlocks && streamingContentBlocks.length > 0);
  const showThinkingIndicator = isStreaming && !hasVisibleStreamingText;

  // Auto-scroll to bottom when messages change or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingContentBlocks, showThinkingIndicator]);

  if (!isOpen) return null;

  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <motion.div
      initial={{height: 0, opacity: 0}}
      animate={{height: 'auto', opacity: 1}}
      exit={{height: 0, opacity: 0}}
      transition={{duration: 0.3, ease: 'easeInOut'}}
      className="overflow-hidden mb-2"
    >
      <div className="bg-[var(--moa-surface-elevated)]/95 backdrop-blur-sm rounded-2xl border border-[var(--moa-border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--moa-border)] bg-[var(--moa-surface)]">
          <span className="text-sm font-medium text-[var(--moa-text-secondary)]">Conversation</span>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)] transition-colors rounded-lg hover:bg-[var(--moa-surface-elevated)]"
            aria-label="Close conversation"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="max-h-[50vh] min-h-[200px] overflow-y-auto px-4 py-4 space-y-4"
        >
          {!hasMessages ? (
            <div className="flex items-center justify-center h-32 text-sm text-[var(--moa-text-tertiary)]">
              Start a conversation to see messages here
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageBubble
                  key={`${message.timestamp}-${index}`}
                  role={message.role}
                  content={message.content}
                  contentBlocks={message.contentBlocks}
                  toolCalls={message.toolCalls}
                  thinkingText={message.thinkingText}
                  products={message.products as import('./ProductCard').Product[] | undefined}
                />
              ))}

              {/* Thinking indicator */}
              <AnimatePresence>
                {showThinkingIndicator && !authRequired && (
                  <motion.div
                    initial={{opacity: 0, y: 4}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -4}}
                    transition={{duration: 0.2}}
                  >
                    <ThinkingIndicator reduceMotion={shouldReduceMotion} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Auth required indicator */}
              <AnimatePresence>
                {authRequired && (
                  <motion.div
                    initial={{opacity: 0, y: 4}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -4}}
                    transition={{duration: 0.2}}
                  >
                    <AuthRequiredIndicator />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Currently streaming message */}
              {isStreaming && hasStreamingContent && (
                <MessageBubble
                  role="assistant"
                  content={streamingText || ''}
                  contentBlocks={streamingContentBlocks}
                  thinkingText={streamingThinkingText}
                  isStreaming={true}
                />
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
