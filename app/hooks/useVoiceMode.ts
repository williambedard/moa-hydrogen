/**
 * Client-side hook for voice interaction: recording, VAD, STT, and TTS playback.
 * Uses Web Audio API + MediaRecorder. Browser-only (no Node.js APIs).
 */

import {useState, useCallback, useRef, useEffect} from 'react';

export interface UseVoiceModeReturn {
  voiceState: 'idle' | 'listening' | 'processing' | 'speaking';
  isVoiceMode: boolean;
  audioLevel: number; // 0-1 for avatar animation
  toggleVoiceMode: () => void;
  startListening: () => void;
  stopListening: () => void;
  speakText: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  queueSpeech: (text: string) => void;
  finishSpeechQueue: () => void;
  transcript: string | null;
  error: string | null;
}

type QueueSegment =
  | {status: 'fetching'; promise: Promise<AudioBuffer>; abortController: AbortController}
  | {status: 'ready'; buffer: AudioBuffer};

const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1500;
const MIME_TYPE = typeof MediaRecorder !== 'undefined' &&
  MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/mp4';

export function useVoiceMode(): UseVoiceModeReturn {
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio resources
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);

  // TTS playback refs
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);
  const ttsRafRef = useRef<number | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  // Audio queue refs
  const queueRef = useRef<QueueSegment[]>([]);
  const isPlayingQueueRef = useRef(false);
  const queueFinishedRef = useRef(false);

  // Keep isVoiceMode in a ref for callbacks
  const isVoiceModeRef = useRef(false);
  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRecording();
      cleanupTTS();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanupRecording() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    audioChunksRef.current = [];
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
  }

  function cleanupTTS() {
    if (ttsRafRef.current !== null) {
      cancelAnimationFrame(ttsRafRef.current);
      ttsRafRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (ttsSourceRef.current) {
      try { ttsSourceRef.current.stop(); } catch {}
      ttsSourceRef.current = null;
    }
    if (ttsAudioContextRef.current) {
      ttsAudioContextRef.current.close().catch(() => {});
      ttsAudioContextRef.current = null;
    }
    ttsAnalyserRef.current = null;

    // Clear audio queue and abort all pending fetches
    for (const segment of queueRef.current) {
      if (segment.status === 'fetching') {
        segment.abortController.abort();
      }
    }
    queueRef.current = [];
    isPlayingQueueRef.current = false;
    queueFinishedRef.current = false;
  }

  /**
   * Monitors mic audio level via AnalyserNode and implements VAD.
   * Calls stopAndSubmit() when silence is detected after speech.
   */
  function startVADLoop(analyser: AnalyserNode, onAutoStop: () => void) {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(dataArray);

      // Compute RMS amplitude normalized to 0-1
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setAudioLevel(rms);

      // VAD logic
      if (rms > SILENCE_THRESHOLD) {
        speechDetectedRef.current = true;
        silenceStartRef.current = null;
      } else if (speechDetectedRef.current) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = performance.now();
        } else if (performance.now() - silenceStartRef.current > SILENCE_DURATION_MS) {
          // Silence after speech detected - auto stop
          onAutoStop();
          return; // stop the loop
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  /**
   * Monitors TTS playback audio level for avatar animation.
   */
  function startTTSLevelLoop(analyser: AnalyserNode) {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setAudioLevel(rms);
      ttsRafRef.current = requestAnimationFrame(tick);
    }

    ttsRafRef.current = requestAnimationFrame(tick);
  }

  /**
   * Fetches TTS audio for a text segment and returns an AudioBuffer.
   */
  async function fetchTTSBuffer(
    text: string,
    abortController: AbortController,
  ): Promise<AudioBuffer> {
    const formData = new FormData();
    formData.append('text', text);

    const response = await fetch('/api/voice-tts', {
      method: 'POST',
      body: formData,
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`TTS error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (abortController.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Get or create AudioContext for decoding
    let audioContext = ttsAudioContextRef.current;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext();
      ttsAudioContextRef.current = audioContext;
    }

    // Guard: check abort signal before decoding (AudioContext may have been
    // closed by cleanupTTS between the fetch and this point)
    if (abortController.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch (err) {
      // If the AudioContext was closed during decode, treat as abort
      if (audioContext.state === 'closed') {
        throw new DOMException('Aborted', 'AbortError');
      }
      throw err;
    }
  }

  /**
   * Plays the next ready segment from the queue. Called when a segment
   * finishes playing or when the first segment becomes ready.
   */
  function playNextInQueue() {
    // If queue is empty, we're done
    if (queueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      if (ttsRafRef.current !== null) {
        cancelAnimationFrame(ttsRafRef.current);
        ttsRafRef.current = null;
      }
      setAudioLevel(0);

      if (queueFinishedRef.current) {
        // Queue is finished — transition out of speaking
        queueFinishedRef.current = false;
        setVoiceState('idle');
      }
      // If queueFinishedRef is false, stay in 'speaking' and wait
      return;
    }

    const next = queueRef.current[0];

    if (next.status === 'fetching') {
      // Not ready yet — wait for the fetch to resolve, which will call playNextInQueue
      isPlayingQueueRef.current = false;
      return;
    }

    // Remove from queue and play
    queueRef.current.shift();
    isPlayingQueueRef.current = true;

    let audioContext = ttsAudioContextRef.current;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext();
      ttsAudioContextRef.current = audioContext;
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    ttsAnalyserRef.current = analyser;

    const source = audioContext.createBufferSource();
    source.buffer = next.buffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    ttsSourceRef.current = source;

    // Restart level monitoring with the new analyser
    if (ttsRafRef.current !== null) {
      cancelAnimationFrame(ttsRafRef.current);
      ttsRafRef.current = null;
    }
    startTTSLevelLoop(analyser);

    source.onended = () => {
      ttsSourceRef.current = null;
      playNextInQueue();
    };

    source.start();
  }

  const sendToSTT = useCallback(async (audioBlob: Blob) => {
    setVoiceState('processing');
    setAudioLevel(0);
    try {
      const formData = new FormData();
      const ext = MIME_TYPE.includes('mp4') ? 'mp4' : 'webm';
      formData.append('audio', audioBlob, `recording.${ext}`);

      const response = await fetch('/api/voice-stt', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`STT error: ${response.status}`);
      }

      const data = await response.json();
      if (data.transcript) {
        setTranscript(data.transcript);
      } else {
        // No transcript - go back to listening if still in voice mode
        setError('Could not understand audio. Please try again.');
        setVoiceState('idle');
      }
    } catch (err) {
      console.error('[useVoiceMode] STT error:', err);
      setError(err instanceof Error ? err.message : 'Speech recognition failed');
      setVoiceState('idle');
    }
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript(null);
    cleanupRecording();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Set up AudioContext + AnalyserNode for VAD
      const audioContext = new AudioContext();
      // Resume in case browser suspended it (not in a direct user gesture context)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {mimeType: MIME_TYPE});
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {type: MIME_TYPE});
        audioChunksRef.current = [];
        if (audioBlob.size > 0 && speechDetectedRef.current) {
          void sendToSTT(audioBlob);
        } else {
          // No speech detected, stay idle
          setVoiceState('idle');
          setAudioLevel(0);
        }
      };

      mediaRecorder.start();
      setVoiceState('listening');
      speechDetectedRef.current = false;
      silenceStartRef.current = null;

      // Start VAD monitoring
      const handleAutoStop = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          streamRef.current?.getTracks().forEach((t) => t.stop());
        }
      };

      startVADLoop(analyser, handleAutoStop);
    } catch (err) {
      console.error('[useVoiceMode] Mic access error:', err);
      setError('Microphone access denied. Please allow microphone access.');
      setVoiceState('idle');
      setIsVoiceMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendToSTT]);

  const stopListening = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const speakText = useCallback(async (text: string) => {
    cleanupTTS();
    setVoiceState('speaking');
    setError(null);

    const abortController = new AbortController();
    ttsAbortRef.current = abortController;

    try {
      const formData = new FormData();
      formData.append('text', text);

      const response = await fetch('/api/voice-tts', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS error: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (abortController.signal.aborted) return;

      const audioContext = new AudioContext();
      ttsAudioContextRef.current = audioContext;

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      if (abortController.signal.aborted) {
        audioContext.close().catch(() => {});
        return;
      }

      // Set up analyser for playback level monitoring
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      ttsAnalyserRef.current = analyser;

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      ttsSourceRef.current = source;

      // Start level monitoring
      startTTSLevelLoop(analyser);

      source.onended = () => {
        if (ttsRafRef.current !== null) {
          cancelAnimationFrame(ttsRafRef.current);
          ttsRafRef.current = null;
        }
        setAudioLevel(0);
        setVoiceState('idle');
      };

      source.start();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[useVoiceMode] TTS error:', err);
      setError(err instanceof Error ? err.message : 'Text-to-speech failed');
      setVoiceState('idle');
      setAudioLevel(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queueSpeech = useCallback((text: string) => {
    setVoiceState('speaking');
    setError(null);

    const abortController = new AbortController();

    // Add a 'fetching' segment to the queue
    const segment: QueueSegment = {
      status: 'fetching',
      promise: fetchTTSBuffer(text, abortController),
      abortController,
    };
    queueRef.current.push(segment);

    // Start fetching and update the segment when ready
    segment.promise
      .then((buffer) => {
        // Find this segment in the queue (it may have been removed by cleanupTTS)
        const idx = queueRef.current.indexOf(segment);
        if (idx === -1) return; // was cleared

        // Replace with ready segment
        queueRef.current[idx] = {status: 'ready', buffer};

        // If this is the first segment and nothing is playing, start playback
        if (idx === 0 && !isPlayingQueueRef.current) {
          playNextInQueue();
        }
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useVoiceMode] Queue TTS fetch error:', err);
        // Remove the failed segment from the queue
        const idx = queueRef.current.indexOf(segment);
        if (idx !== -1) {
          queueRef.current.splice(idx, 1);
        }
        // If queue is now empty and nothing playing, handle completion
        if (queueRef.current.length === 0 && !isPlayingQueueRef.current) {
          setError(err instanceof Error ? err.message : 'Text-to-speech failed');
          if (queueFinishedRef.current) {
            queueFinishedRef.current = false;
            setVoiceState('idle');
            setAudioLevel(0);
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishSpeechQueue = useCallback(() => {
    queueFinishedRef.current = true;

    // If nothing is playing and queue is empty, transition immediately
    if (!isPlayingQueueRef.current && queueRef.current.length === 0) {
      queueFinishedRef.current = false;
      setAudioLevel(0);
      setVoiceState('idle');
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    cleanupTTS();
    setAudioLevel(0);
    setVoiceState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setIsVoiceMode((prev) => {
      const next = !prev;
      if (next) {
        setError(null);
        setTranscript(null);
        // Will start listening after state update via effect
      } else {
        // Turning off voice mode - clean everything up
        cleanupRecording();
        cleanupTTS();
        setVoiceState('idle');
        setAudioLevel(0);
        setTranscript(null);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start listening when voice mode is toggled on
  useEffect(() => {
    if (isVoiceMode && voiceState === 'idle') {
      startListening();
    }
    // Only run when isVoiceMode changes, not on every voiceState change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceMode]);

  return {
    voiceState,
    isVoiceMode,
    audioLevel,
    toggleVoiceMode,
    startListening,
    stopListening,
    speakText,
    stopSpeaking,
    queueSpeech,
    finishSpeechQueue,
    transcript,
    error,
  };
}
