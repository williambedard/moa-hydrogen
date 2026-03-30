import {useRef, useEffect, useState, useCallback} from 'react';
import {motion, AnimatePresence, useReducedMotion} from 'framer-motion';
import {ConciergeAvatar} from './ConciergeAvatar';
import {ConversationPanel} from './ConversationPanel';
import {VoiceVisualizer} from './VoiceVisualizer';
import type {ConversationMessage} from '~/lib/conversation-storage.client';
import type {ContentBlock} from '~/hooks/useStreamingChat';
import type {ProductContext} from '~/lib/product-context';

const PLACEHOLDER_SUGGESTIONS = [
  'Find me a summer dress...',
  'I need an outfit for a wedding...',
  'Show me casual weekend looks...',
  'Looking for something elegant...',
  'Find cozy winter essentials...',
  'I want a bold statement piece...',
  'Show me minimalist basics...',
  'Looking for date night outfits...',
];

const PRODUCT_PLACEHOLDER_SUGGESTIONS = [
  'What sizes does this come in?',
  'What colours are available?',
  'Is this true to size?',
  'What material is this made of?',
  'How should I style this?',
  'Do you have similar items?',
  'Is this suitable for summer?',
  'Can I see matching accessories?',
];

interface ConciergePromptProps {
  isLoading: boolean;
  historyJson?: string;
  shoppingContextJson?: string;
  productContextJson?: string;
  messages?: ConversationMessage[];
  hasHistory?: boolean;
  onNewChat?: () => void;
  onSubmit?: (formData: FormData) => void;
  // Streaming state
  streamingText?: string;
  streamingContentBlocks?: ContentBlock[];
  streamingThinkingText?: string;
  isStreaming?: boolean;
  // Dynamic AI-generated prompts
  suggestedPrompts?: string[] | null;
  // Voice mode props
  isVoiceMode?: boolean;
  voiceState?: 'idle' | 'listening' | 'processing' | 'speaking';
  audioLevel?: number;
  onToggleVoiceMode?: () => void;
  onStopSpeaking?: () => void;
  onStartListening?: () => void;
}

export function ConciergePrompt({
  isLoading,
  historyJson = '',
  shoppingContextJson = '',
  productContextJson = '',
  messages = [],
  hasHistory = false,
  onNewChat,
  onSubmit,
  streamingText,
  streamingContentBlocks,
  streamingThinkingText,
  isStreaming,
  suggestedPrompts,
  isVoiceMode = false,
  voiceState = 'idle',
  audioLevel = 0,
  onToggleVoiceMode,
  onStopSpeaking,
  onStartListening,
}: ConciergePromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Use AI-generated prompts if available, otherwise fall back to static placeholders
  const isViewingProduct = !!productContextJson;
  const staticPlaceholders = isViewingProduct ? PRODUCT_PLACEHOLDER_SUGGESTIONS : PLACEHOLDER_SUGGESTIONS;
  const placeholders = (suggestedPrompts && suggestedPrompts.length > 0) ? suggestedPrompts : staticPlaceholders;

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  // Clear input when streaming starts, refocus when it ends
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming && inputRef.current) {
      inputRef.current.value = '';
      wasStreamingRef.current = true;
    } else if (!isStreaming && wasStreamingRef.current && inputRef.current) {
      wasStreamingRef.current = false;
      inputRef.current.focus();
    }
  }, [isStreaming]);

  // Auto-show conversation panel when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setShowConversation(true);
    }
  }, [isStreaming]);

  // Reset placeholder index when placeholders change (switching modes or new AI suggestions)
  useEffect(() => {
    setPlaceholderIndex(0);
  }, [isViewingProduct, suggestedPrompts]);

  // Rotate placeholders
  useEffect(() => {
    if (!isExpanded) return;

    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
        setIsAnimating(false);
      }, 200);
    }, 4000);

    return () => clearInterval(interval);
  }, [isExpanded, placeholders.length]);

  // Close on outside click
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !isLoading &&
        !isStreaming &&
        !isFocused
      ) {
        setIsExpanded(false);
        setShowConversation(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, isLoading, isStreaming, isFocused]);

  // Close on Escape key
  useEffect(() => {
    if (!isExpanded) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading && !isStreaming) {
        if (showConversation) {
          setShowConversation(false);
        } else {
          setIsExpanded(false);
        }
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded, isLoading, isStreaming, showConversation]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const query = formData.get('query')?.toString().trim();

      if (query && onSubmit) {
        onSubmit(formData);
      }
    },
    [onSubmit],
  );

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const handleClose = useCallback(() => {
    if (!isLoading && !isStreaming) {
      setIsExpanded(false);
      setShowConversation(false);
    }
  }, [isLoading, isStreaming]);

  const handleToggleConversation = useCallback(() => {
    setShowConversation((prev) => !prev);
  }, []);

  const handleNewChat = useCallback(() => {
    setShowConversation(false);
    onNewChat?.();
  }, [onNewChat]);

  const springTransition = shouldReduceMotion
    ? {duration: 0}
    : {type: 'spring', stiffness: 400, damping: 30};

  const fadeTransition = shouldReduceMotion
    ? {duration: 0}
    : {duration: 0.2};

  const busy = isLoading || isStreaming;

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-[110]">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.button
            key="collapsed"
            layoutId="concierge-container"
            onClick={handleExpand}
            className="group relative w-16 h-16 rounded-full shadow-lg hover:shadow-xl transition-shadow focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-2 cursor-pointer p-[2px]"
            style={{
              background: 'linear-gradient(90deg, #f4c4ce, #d8c4e8, #c4d4f4, #f4c4ce)',
              backgroundSize: '300% 100%',
              animation: shouldReduceMotion ? 'none' : 'gradientRotate 6s linear infinite',
            }}
            initial={{scale: 0.8, opacity: 0}}
            animate={{scale: 1, opacity: 1}}
            exit={{scale: 0.8, opacity: 0}}
            transition={springTransition}
            aria-label="Open AI shopping assistant"
          >
            <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Ask the AI Concierge
              <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900" />
            </span>
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <ConciergeAvatar size={52} />
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            layoutId="concierge-container"
            className="relative w-[700px] max-w-[calc(100vw-3rem)]"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={springTransition}
          >
            {/* Conversation panel (above input) */}
            <AnimatePresence>
              {showConversation && (
                <ConversationPanel
                  messages={messages}
                  isOpen={showConversation}
                  onClose={() => setShowConversation(false)}
                  streamingText={streamingText}
                  streamingContentBlocks={streamingContentBlocks}
                  streamingThinkingText={streamingThinkingText}
                  isStreaming={isStreaming}
                />
              )}
            </AnimatePresence>

            {/* Soft glow effect */}
            <div
              className="absolute inset-0 rounded-[20px] blur-2xl opacity-40 -z-10"
              style={{
                background: 'linear-gradient(90deg, #fdd, #e8d5f0, #dde8fd)',
              }}
            />

            {/* Outer gradient border */}
            <div
              className="relative rounded-[20px] p-[1px] overflow-hidden"
              style={{
                background: 'linear-gradient(90deg, #f4c4ce, #d8c4e8, #c4d4f4, #f4c4ce)',
                backgroundSize: '300% 100%',
                animation: shouldReduceMotion ? 'none' : 'gradientRotate 6s linear infinite',
              }}
            >
              {/* White inner container */}
              <div className="flex items-center bg-white rounded-[19px] pl-2 pr-3 py-2">
                {/* Avatar */}
                <motion.div
                  className="shrink-0"
                  layoutId="concierge-avatar"
                  transition={springTransition}
                >
                  <ConciergeAvatar size={40} />
                </motion.div>

                {/* Form */}
                <motion.div
                  className="flex-1 flex items-center ml-2"
                  initial={{opacity: 0, x: -10}}
                  animate={{opacity: 1, x: 0}}
                  transition={fadeTransition}
                >
                  <form
                    ref={formRef}
                    method="post"
                    className="ai-form flex-1 flex items-center"
                    onSubmit={handleSubmit}
                  >
                    {/* Hidden inputs */}
                    <input type="hidden" name="history" value={historyJson} />
                    <input type="hidden" name="shoppingContext" value={shoppingContextJson} />
                    <input type="hidden" name="productContext" value={productContextJson} />

                    {/* Show conversation button */}
                    {hasHistory && (
                      <button
                        type="button"
                        onClick={handleToggleConversation}
                        className={`mr-2 shrink-0 w-8 h-8 flex items-center justify-center transition-colors rounded-lg hover:bg-gray-50 ${
                          showConversation ? 'text-pink-500' : 'text-gray-400 hover:text-gray-600'
                        }`}
                        aria-label={showConversation ? 'Hide conversation' : 'Show conversation'}
                        title={showConversation ? 'Hide conversation' : 'Show conversation'}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}

                    {/* New Chat button */}
                    {hasHistory && onNewChat && (
                      <button
                        type="button"
                        onClick={handleNewChat}
                        className="mr-2 shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
                        aria-label="New chat"
                        title="Start new conversation"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M12 4v16M4 12h16"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}

                    {/* Voice mode toggle button */}
                    {onToggleVoiceMode && (
                      <button
                        type="button"
                        onClick={onToggleVoiceMode}
                        className={`mr-2 shrink-0 w-8 h-8 flex items-center justify-center transition-colors rounded-lg hover:bg-gray-50 ${
                          isVoiceMode ? 'text-pink-500' : 'text-gray-400 hover:text-gray-600'
                        }`}
                        aria-label={isVoiceMode ? 'Switch to text input' : 'Switch to voice input'}
                        title={isVoiceMode ? 'Switch to text input' : 'Switch to voice input'}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}

                    {isVoiceMode ? (
                      <>
                        {/* Voice mode: visualizer + status */}
                        <div className="flex-1 flex items-center min-w-0">
                          {voiceState === 'listening' && (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="voice-recording-dot shrink-0 w-2 h-2 rounded-full bg-red-500" />
                              <VoiceVisualizer audioLevel={audioLevel} isActive className="flex-1" />
                              <span className="text-xs text-gray-400 shrink-0">Listening...</span>
                            </div>
                          )}
                          {voiceState === 'processing' && (
                            <div className="flex items-center gap-2 flex-1">
                              <svg className="w-4 h-4 animate-spin text-pink-400 shrink-0" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span className="text-sm text-gray-500">Processing...</span>
                            </div>
                          )}
                          {voiceState === 'speaking' && (
                            <div className="flex items-center gap-2 flex-1">
                              <VoiceVisualizer audioLevel={audioLevel} isActive className="flex-1" />
                              <span className="text-xs text-gray-400 shrink-0">Speaking...</span>
                            </div>
                          )}
                          {voiceState === 'idle' && (
                            <button
                              type="button"
                              onClick={onStartListening}
                              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                                <path
                                  d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              Tap to speak
                            </button>
                          )}
                        </div>

                        {/* Stop button when speaking */}
                        {voiceState === 'speaking' && onStopSpeaking && (
                          <button
                            type="button"
                            onClick={onStopSpeaking}
                            className="ml-2 shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-50"
                            aria-label="Stop speaking"
                            title="Stop speaking"
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="6" width="12" height="12" rx="2" />
                            </svg>
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Text mode: input + submit */}
                        <input
                          ref={inputRef}
                          name="query"
                          type="text"
                          placeholder={placeholders[placeholderIndex]}
                          className={`ai-input flex-1 min-w-0 text-[15px] bg-transparent text-gray-700 placeholder:text-gray-400 placeholder:transition-opacity placeholder:duration-200 ${
                            isAnimating ? 'placeholder:opacity-0' : 'placeholder:opacity-100'
                          }`}
                          disabled={busy}
                          autoComplete="off"
                          autoCorrect="off"
                          data-form-type="other"
                          data-1p-ignore
                          data-lpignore="true"
                          data-protonpass-ignore="true"
                          data-bwignore="true"
                          onFocus={handleFocus}
                          onBlur={handleBlur}
                        />

                        <button
                          type="submit"
                          className="ml-2 shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50 disabled:opacity-40"
                          disabled={busy}
                          aria-label="Submit"
                        >
                          {busy ? (
                            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M5 12h14M12 5l7 7-7 7"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      </>
                    )}
                  </form>

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={handleClose}
                    className="ml-1 shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
                    aria-label="Close"
                    disabled={busy}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M18 6L6 18M6 6l12 12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Responsive styles */}
      <style>{`
        @media (min-width: 640px) {
          .fixed.bottom-6.right-6 > div:last-child {
            width: calc(100vw - 3rem);
            max-width: 700px;
          }
        }
        @media (max-width: 639px) {
          .fixed.bottom-6.right-6 {
            right: 1rem;
            left: 1rem;
            width: auto;
          }
          .fixed.bottom-6.right-6 > button:first-child {
            position: absolute;
            right: 0;
            width: 48px;
            height: 48px;
          }
        }
      `}</style>
    </div>
  );
}
