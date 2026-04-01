import {useRef, useEffect, useState, useCallback} from 'react';
import {motion, AnimatePresence, useReducedMotion} from 'framer-motion';
import {ConciergeAvatar} from './ConciergeAvatar';
import {ConversationPanel} from './ConversationPanel';
import {VoiceVisualizer} from './VoiceVisualizer';
import type {ConversationMessage} from '~/lib/conversation-storage.client';
import type {ContentBlock} from '~/hooks/useStreamingChat';
import type {ProductContext} from '~/lib/product-context';
import {HERO_PROMPTS} from '~/components/WelcomeHero';

const PLACEHOLDER_SUGGESTIONS = [
  'Tell me about creatine stability...',
  'What sets your omega-3 apart?',
  'Build me a supplement stack...',
  'How does MOA source ingredients?',
  'What clinical studies back this?',
  'Help me optimize recovery...',
];

const PRODUCT_PLACEHOLDER_SUGGESTIONS = [
  'What clinical data supports this?',
  'How should I dose this?',
  'What makes this formulation unique?',
  'Can I combine this with other supplements?',
  'What results should I expect?',
  'How does this compare to competitors?',
  'Is this third-party tested?',
  'What are the active ingredients?',
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
  /** When true, renders centered inline (hero mode) instead of fixed bottom-right */
  isInHero?: boolean;
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
  isInHero = false,
}: ConciergePromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Hero mode is always expanded; widget mode starts expanded too
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

  // Reset placeholder index when placeholders change
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

  // Close on outside click (widget mode only)
  useEffect(() => {
    if (!isExpanded || isInHero) return;

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
  }, [isExpanded, isLoading, isStreaming, isFocused, isInHero]);

  // Close on Escape key (widget mode collapses; hero mode only closes conversation)
  useEffect(() => {
    if (!isExpanded) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading && !isStreaming) {
        if (showConversation) {
          setShowConversation(false);
        } else if (!isInHero) {
          setIsExpanded(false);
        }
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded, isLoading, isStreaming, showConversation, isInHero]);

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

  // Hero-mode prompt chip handler
  const handleChipClick = useCallback(
    (prompt: string) => {
      if (!onSubmit) return;
      const formData = new FormData();
      formData.set('query', prompt);
      if (historyJson) formData.set('history', historyJson);
      if (shoppingContextJson) formData.set('shoppingContext', shoppingContextJson);
      if (productContextJson) formData.set('productContext', productContextJson);
      onSubmit(formData);
    },
    [onSubmit, historyJson, shoppingContextJson, productContextJson],
  );

  // In hero mode: always expanded, no collapse, centered layout
  // Ensure expanded when switching to hero mode
  useEffect(() => {
    if (isInHero) setIsExpanded(true);
  }, [isInHero]);

  const fadeDuration = shouldReduceMotion ? 0 : 0.25;

  return (
    <AnimatePresence mode="wait">
    <motion.div
      ref={containerRef}
      key={isInHero ? 'hero' : 'widget'}
      className={isInHero
        ? 'relative z-[110] w-full'
        : 'fixed z-[110] w-[700px] max-w-[calc(100vw-3rem)] bottom-6 right-6'
      }
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      transition={{duration: fadeDuration}}
    >
      <AnimatePresence mode="wait">
        {!isExpanded && !isInHero ? (
          <motion.button
            key="collapsed"
            layoutId="concierge-container"
            onClick={handleExpand}
            className="group relative w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--moa-accent)] focus:ring-offset-2 focus:ring-offset-[var(--moa-bg)] cursor-pointer bg-[var(--moa-surface)] border border-[var(--moa-accent)]/30"
            style={{
              animation: shouldReduceMotion ? 'none' : 'accentPulse 3s ease-in-out infinite',
            }}
            initial={{scale: 0.8, opacity: 0}}
            animate={{scale: 1, opacity: 1}}
            exit={{scale: 0.8, opacity: 0}}
            transition={springTransition}
            aria-label="Open AI assistant"
          >
            <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[var(--moa-surface-elevated)] text-[var(--moa-text)] text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-[var(--moa-border)]">
              Ask MOA
              <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-[var(--moa-surface-elevated)]" />
            </span>
            <div className="w-full h-full flex items-center justify-center">
              <ConciergeAvatar size={36} />
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            layoutId="concierge-container"
            className={`relative ${isInHero ? 'w-full' : 'w-[700px] max-w-[calc(100vw-3rem)]'}`}
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

            {/* Input container */}
            <div className="relative rounded-2xl p-[1px] border border-[var(--moa-border)] bg-[var(--moa-surface)]">
              <div className="flex items-center rounded-[15px] pl-2 pr-3 py-2">
                {/* Avatar */}
                <motion.div
                  className="shrink-0"
                  layoutId="concierge-avatar"
                  transition={springTransition}
                >
                  <ConciergeAvatar size={36} />
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
                        className={`mr-2 shrink-0 w-8 h-8 flex items-center justify-center transition-colors rounded-lg hover:bg-[var(--moa-surface-elevated)] ${
                          showConversation ? 'text-[var(--moa-accent)]' : 'text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)]'
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
                        className="mr-2 shrink-0 w-8 h-8 flex items-center justify-center text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)] transition-colors rounded-lg hover:bg-[var(--moa-surface-elevated)]"
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
                        className={`mr-2 shrink-0 w-8 h-8 flex items-center justify-center transition-colors rounded-lg hover:bg-[var(--moa-surface-elevated)] ${
                          isVoiceMode ? 'text-[var(--moa-accent)]' : 'text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)]'
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
                              <span className="voice-recording-dot shrink-0 w-2 h-2 rounded-full bg-[var(--moa-error)]" />
                              <VoiceVisualizer audioLevel={audioLevel} isActive className="flex-1" />
                              <span className="text-xs text-[var(--moa-text-tertiary)] shrink-0">Listening...</span>
                            </div>
                          )}
                          {voiceState === 'processing' && (
                            <div className="flex items-center gap-2 flex-1">
                              <svg className="w-4 h-4 animate-spin text-[var(--moa-accent)] shrink-0" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span className="text-sm text-[var(--moa-text-secondary)]">Processing...</span>
                            </div>
                          )}
                          {voiceState === 'speaking' && (
                            <div className="flex items-center gap-2 flex-1">
                              <VoiceVisualizer audioLevel={audioLevel} isActive className="flex-1" />
                              <span className="text-xs text-[var(--moa-text-tertiary)] shrink-0">Speaking...</span>
                            </div>
                          )}
                          {voiceState === 'idle' && (
                            <button
                              type="button"
                              onClick={onStartListening}
                              className="flex items-center gap-2 text-sm text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)] transition-colors"
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
                            className="ml-2 shrink-0 w-8 h-8 flex items-center justify-center text-[var(--moa-text-tertiary)] hover:text-[var(--moa-error)] transition-colors rounded-lg hover:bg-[var(--moa-surface-elevated)]"
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
                          className={`ai-input flex-1 min-w-0 text-[15px] placeholder:transition-opacity placeholder:duration-200 ${
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
                          className="ml-2 shrink-0 w-8 h-8 flex items-center justify-center text-[var(--moa-text-tertiary)] hover:text-[var(--moa-accent)] transition-colors rounded-lg hover:bg-[var(--moa-surface-elevated)] disabled:opacity-40"
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

                  {/* Close button (widget mode only) */}
                  {!isInHero && (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="ml-1 shrink-0 w-8 h-8 flex items-center justify-center text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)] transition-colors rounded-lg hover:bg-[var(--moa-surface-elevated)]"
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
                  )}
                </motion.div>
              </div>
            </div>
            {/* Prompt chips (hero mode only — fade out on scroll) */}
            <AnimatePresence>
              {isInHero && (
                <motion.div
                  className="flex flex-wrap justify-center gap-2 mt-6"
                  initial={{opacity: 0, y: 8}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: 8}}
                  transition={{duration: 0.2}}
                >
                  {HERO_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleChipClick(prompt)}
                      className="px-4 py-2 text-sm font-[var(--font-body)] text-[var(--moa-text-secondary)] bg-[var(--moa-surface)] border border-[var(--moa-border)] rounded-full hover:text-[var(--moa-accent)] hover:border-[var(--moa-accent)]/30 transition-all duration-200"
                    >
                      {prompt}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
    </AnimatePresence>
  );
}
