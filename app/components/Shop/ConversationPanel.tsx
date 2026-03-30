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
}

function ThinkingIndicator({reduceMotion}: {reduceMotion: boolean | null}) {
  return (
    <div className="flex gap-3 flex-row">
      <div className="shrink-0">
        <div className="w-8 h-8 rounded-full overflow-hidden">
          <ConciergeAvatar size={32} />
        </div>
      </div>
      <div className="flex-1">
        <div className="inline-flex items-center gap-1 bg-white text-gray-700 rounded-2xl rounded-tl-sm border border-gray-100 px-4 py-3 shadow-sm">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block w-1.5 h-1.5 rounded-full bg-gray-400"
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

export function ConversationPanel({
  messages,
  isOpen,
  onClose,
  streamingText,
  streamingContentBlocks,
  streamingThinkingText,
  isStreaming,
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const hasStreamingContent = !!(streamingText || (streamingContentBlocks && streamingContentBlocks.length > 0));
  const showThinkingIndicator = isStreaming && !hasStreamingContent;

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
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <span className="text-sm font-medium text-gray-600">Conversation</span>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
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
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
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
                />
              ))}

              {/* Thinking indicator - shown immediately when streaming starts, before any content */}
              <AnimatePresence>
                {showThinkingIndicator && (
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
