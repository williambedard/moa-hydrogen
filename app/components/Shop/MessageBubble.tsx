import {useState} from 'react';
import {motion, AnimatePresence, useReducedMotion} from 'framer-motion';
import Markdown from 'react-markdown';
import type {ToolCallRecord, ContentBlock} from '~/lib/conversation-storage.client';
import {ToolCallDisplay} from './ToolCallDisplay';
import {ConciergeAvatar} from './ConciergeAvatar';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  contentBlocks?: ContentBlock[];
  toolCalls?: ToolCallRecord[];
  thinkingText?: string;
  isStreaming?: boolean;
}

export function MessageBubble({
  role,
  content,
  contentBlocks,
  toolCalls,
  thinkingText,
  isStreaming = false,
}: MessageBubbleProps) {
  const [showThinking, setShowThinking] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const isUser = role === 'user';

  // Build render blocks: use contentBlocks if available, otherwise fall back
  // to the legacy layout (content + toolCalls).
  const blocks: ContentBlock[] = contentBlocks && contentBlocks.length > 0
    ? contentBlocks
    : buildLegacyBlocks(content, toolCalls);

  // Check if any tool is still pending (for gating text after pending tools)
  const hasAnyPendingTool = blocks.some(
    (b) => b.type === 'tool' && b.toolCall.status === 'pending',
  );

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0">
          <div className="w-8 h-8 rounded-full overflow-hidden">
            <ConciergeAvatar size={32} />
          </div>
        </div>
      )}

      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Message content */}
      <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
        <div
          className={`max-w-[85%] ${
            isUser
              ? 'bg-gray-100 text-gray-800 rounded-2xl rounded-tr-sm'
              : 'bg-white text-gray-700 rounded-2xl rounded-tl-sm border border-gray-100'
          } px-4 py-2.5 shadow-sm`}
        >
          {/* Extended thinking toggle */}
          {thinkingText && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowThinking(!showThinking)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {showThinking ? 'Hide' : 'Show'} reasoning
                <svg
                  className={`w-3 h-3 transition-transform ${showThinking ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M19 9l-7 7-7-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <AnimatePresence>
                {showThinking && (
                  <motion.div
                    initial={{height: 0, opacity: 0}}
                    animate={{height: 'auto', opacity: 1}}
                    exit={{height: 0, opacity: 0}}
                    transition={{duration: 0.2}}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 text-xs italic text-gray-400 bg-gray-50 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                      {thinkingText}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Render content blocks in stream order */}
          {blocks.map((block, i) => {
            if (block.type === 'text') {
              // A text block after a pending tool should be held back
              const hasPendingToolBefore = blocks
                .slice(0, i)
                .some((b) => b.type === 'tool' && b.toolCall.status === 'pending');

              if (hasPendingToolBefore) return null;

              const isLast = i === blocks.length - 1;
              const isFirst = i === 0;
              return (
                <div key={`text-${i}`} className={`text-sm prose-chat ${!isFirst ? 'mt-3' : ''}`}>
                  <Markdown>{block.text}</Markdown>
                  {isStreaming && isLast && (
                    <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
                  )}
                </div>
              );
            }

            if (block.type === 'tool') {
              const isFirst = i === 0;
              return (
                <div key={block.toolCall.id} className={`${!isFirst ? 'mt-2' : ''} space-y-2`}>
                  <ToolCallDisplay
                    id={block.toolCall.id}
                    tool={block.toolCall.tool}
                    params={block.toolCall.params}
                    result={block.toolCall.result}
                    status={block.toolCall.status}
                    isStreaming={isStreaming}
                  />
                </div>
              );
            }

            return null;
          })}

          {/* Activity indicator while tools are pending and text is held back */}
          {hasAnyPendingTool && (
            <div className="mt-2 flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block w-1 h-1 rounded-full bg-gray-400"
                  animate={shouldReduceMotion ? {} : {opacity: [0.3, 1, 0.3]}}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          )}

          {/* Show cursor when streaming with no content yet */}
          {isStreaming && blocks.length === 0 && (
            <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Build content blocks from legacy message format (content + toolCalls).
 * Used for messages restored from IndexedDB that predate the contentBlocks field.
 */
function buildLegacyBlocks(content: string, toolCalls?: ToolCallRecord[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (toolCalls && toolCalls.length > 0) {
    // Legacy layout: all tools first, then content as post-tool text
    for (const tc of toolCalls) {
      blocks.push({type: 'tool', toolCall: tc});
    }
    if (content) {
      blocks.push({type: 'text', text: content});
    }
  } else if (content) {
    blocks.push({type: 'text', text: content});
  }

  return blocks;
}
