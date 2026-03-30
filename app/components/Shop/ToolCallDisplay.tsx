import {useState, useEffect, useRef} from 'react';
import {motion, AnimatePresence, useReducedMotion} from 'framer-motion';

interface ToolCallDisplayProps {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'complete' | 'error';
  isStreaming?: boolean;
}

function ElapsedTime({startTime}: {startTime: number}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (elapsed < 1) return null;
  return <span className="text-xs text-gray-400 ml-1">{elapsed}s</span>;
}

export function ToolCallDisplay({
  tool,
  params,
  result,
  status,
  isStreaming = false,
}: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCompletionFlash, setShowCompletionFlash] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const startTimeRef = useRef(Date.now());
  const prevStatusRef = useRef(status);

  // Detect transition from pending to complete for animation
  useEffect(() => {
    if (prevStatusRef.current === 'pending' && status === 'complete') {
      setShowCompletionFlash(true);
      const timer = setTimeout(() => setShowCompletionFlash(false), 600);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'text-amber-600 bg-amber-50';
      case 'complete':
        return 'text-emerald-600 bg-emerald-50';
      case 'error':
        return 'text-red-600 bg-red-50';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return (
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
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
        );
      case 'complete':
        return (
          <motion.svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            initial={shouldReduceMotion ? false : {scale: 0}}
            animate={{scale: 1}}
            transition={{type: 'spring', stiffness: 400, damping: 15, duration: 0.25}}
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        );
      case 'error':
        return (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 18L18 6M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
    }
  };

  const formatToolName = (name: string) => {
    return name;
  };

  const formatParams = (params: Record<string, unknown>) => {
    const entries = Object.entries(params);
    if (entries.length === 0) return null;

    return entries.map(([key, value]) => (
      <div key={key} className="flex gap-2 text-xs">
        <span className="text-gray-500">{key}:</span>
        <span className="text-gray-700 font-mono">
          {typeof value === 'string' ? value : JSON.stringify(value)}
        </span>
      </div>
    ));
  };

  return (
    <motion.div
      className={`border rounded-lg overflow-hidden bg-white/50 transition-colors duration-300 ${
        showCompletionFlash ? 'border-emerald-300' : 'border-gray-200'
      }`}
      layout={!shouldReduceMotion}
      transition={{layout: {duration: 0.2}}}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
      >
        <span className={`flex items-center justify-center w-5 h-5 rounded-full ${getStatusColor()}`}>
          {getStatusIcon()}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-700">
          {formatToolName(tool)}
          {status === 'pending' && isStreaming && (
            <ElapsedTime startTime={startTimeRef.current} />
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
        {isExpanded && (
          <motion.div
            initial={{height: 0, opacity: 0}}
            animate={{height: 'auto', opacity: 1}}
            exit={{height: 0, opacity: 0}}
            transition={{duration: 0.2}}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
              {/* Parameters */}
              {Object.keys(params).length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-medium text-gray-500 mb-1">Parameters</div>
                  <div className="space-y-0.5 pl-2">
                    {formatParams(params)}
                  </div>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className="pt-1">
                  <div className="text-xs font-medium text-gray-500 mb-1">Result</div>
                  <div className="text-xs text-gray-600 font-mono bg-gray-50 rounded p-2 max-h-32 overflow-auto">
                    {result.length > 300 ? `${result.slice(0, 300)}...` : result}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
