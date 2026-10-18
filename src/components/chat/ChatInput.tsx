import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Paperclip, Square, X, FileText, Mic, BookOpen, Plus, Sparkles, GraduationCap, Lightbulb, ListChecks, Brain, Loader2, CircleCheck, CircleAlert, Globe2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBayanAlert } from '../../contexts/AlertContext';
import { hasExplicitWebSearchIntent } from '../../../lib/web/searchIntent';

interface SpeechRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface ChatInputProps {
  onSendMessage: (message: string, files: File[], webSearchConsent?: boolean) => void;
  isGenerating?: boolean;
  onStopGeneration?: () => void;
  disabled?: boolean;
  uploadProgress?: number | null;
  uploadStatus?: 'uploading' | 'success' | 'error' | null;
  studyMode?: boolean;
  onToggleStudyMode?: () => void;
  onGenerateImage?: (
    prompt: string,
    options: { aspectRatio: '1:1' | '16:9' | '9:16' | '4:3'; style: 'cinematic' | 'anime' | '3d-render' | 'photorealistic' | 'watercolor' },
  ) => Promise<void>;
  imageGenerationBusy?: boolean;
  expanded?: boolean;
  homeMode?: boolean;
  openImageGenerator?: boolean;
  imagePromptDraft?: string | null;
  onImagePromptDraftConsumed?: () => void;
  onImageGeneratorOpenChange?: (open: boolean) => void;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  onToggleThinking?: () => void;
}

const ACCEPTED_FILES = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.csv,.json';

export function ChatInput({
  onSendMessage,
  isGenerating = false,
  onStopGeneration,
  disabled = false,
  uploadProgress = null,
  uploadStatus = null,
  studyMode = false,
  onToggleStudyMode,
  onGenerateImage,
  imageGenerationBusy = false,
  expanded = false,
  homeMode = false,
  openImageGenerator = false,
  imagePromptDraft = null,
  onImagePromptDraftConsumed,
  onImageGeneratorOpenChange,
  webSearchEnabled = false,
  thinkingEnabled = true,
  onToggleThinking,
}: ChatInputProps) {
  const { t, currentLang } = useLanguage();
  const showAlert = useBayanAlert();
  const [text, setText] = useState('');
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [featuresMounted, setFeaturesMounted] = useState(false);
  const [featuresVisible, setFeaturesVisible] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageDialogMounted, setImageDialogMounted] = useState(false);
  const [imageDialogVisible, setImageDialogVisible] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3'>('1:1');
  const [imageStyle, setImageStyle] = useState<'cinematic' | 'anime' | '3d-render' | 'photorealistic' | 'watercolor'>('cinematic');
  const [imageError, setImageError] = useState('');
  const [searchConfirmation, setSearchConfirmation] = useState<{ message: string; files: File[] } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pdfDocuments, setPdfDocuments] = useState<Record<string, string>>({});
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [pdfOperation, setPdfOperation] = useState<{ key: string; status: 'busy' | 'done' | 'error'; text: string }>({
    key: '',
    status: 'done',
    text: '',
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const featuresTriggerRef = useRef<HTMLButtonElement>(null);
  const featuresMenuRef = useRef<HTMLDivElement>(null);
  const [featuresPosition, setFeaturesPosition] = useState<React.CSSProperties | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pdfDocumentIds = useRef(new Map<string, string>());
  const speechConstructor = (window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }).SpeechRecognition ?? (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
  const canRecordAudio = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const showWebSearchIndicator = webSearchEnabled || hasExplicitWebSearchIntent(text);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  useEffect(() => {
    if (uploadStatus === 'success') setFiles([]);
  }, [uploadStatus]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const maxHeight = Number.parseFloat(window.getComputedStyle(composer).maxHeight) || 200;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, maxHeight)}px`;
    composer.style.overflowY = composer.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [text]);

  useEffect(() => {
    if (openImageGenerator) {
      setImageError('');
      setImageDialogOpen(true);
      if (imagePromptDraft !== null) {
        setImagePrompt(imagePromptDraft);
        onImagePromptDraftConsumed?.();
      }
    }
  }, [openImageGenerator, imagePromptDraft, onImagePromptDraftConsumed]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!featuresOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !featuresRef.current?.contains(event.target)
        && !featuresMenuRef.current?.contains(event.target)) {
        setFeaturesOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFeaturesOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [featuresOpen]);

  useEffect(() => {
    if (!featuresMounted) return;
    const updatePosition = () => {
      const trigger = featuresTriggerRef.current;
      const menu = featuresMenuRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const margin = 8;
      const gap = 12;
      const viewportHeight = window.innerHeight;
      const availableAbove = Math.min(
        viewportHeight - margin * 2,
        Math.max(0, triggerRect.top - gap - margin),
      );
      const availableBelow = Math.min(
        viewportHeight - margin * 2,
        Math.max(0, viewportHeight - triggerRect.bottom - gap - margin),
      );
      const menuHeight = menu.scrollHeight;
      const placeAbove = menuHeight <= availableAbove || availableAbove >= availableBelow;
      const maxHeight = Math.max(80, placeAbove ? availableAbove : availableBelow);
      const height = Math.min(menuHeight, maxHeight);
      const width = Math.min(288, window.innerWidth - margin * 2);
      const isRtl = document.documentElement.dir === 'rtl';
      const alignedLeft = isRtl ? triggerRect.right - width : triggerRect.left;
      const left = Math.max(margin, Math.min(alignedLeft, window.innerWidth - width - margin));
      const top = placeAbove
        ? Math.max(margin, triggerRect.top - gap - height)
        : Math.min(viewportHeight - margin - height, triggerRect.bottom + gap);
      setFeaturesPosition({ position: 'fixed', left, top, width, maxHeight, overflowY: 'auto' });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [featuresMounted, featuresOpen]);

  useEffect(() => {
    let frame: number | undefined;
    let closeTimer: number | undefined;
    if (featuresOpen) {
      setFeaturesMounted(true);
      frame = window.requestAnimationFrame(() => setFeaturesVisible(true));
    } else {
      setFeaturesVisible(false);
      closeTimer = window.setTimeout(() => setFeaturesMounted(false), 180);
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
    };
  }, [featuresOpen]);

  useEffect(() => {
    let frame: number | undefined;
    let closeTimer: number | undefined;
    if (imageDialogOpen) {
      setImageDialogMounted(true);
      frame = window.requestAnimationFrame(() => setImageDialogVisible(true));
    } else {
      setImageDialogVisible(false);
      closeTimer = window.setTimeout(() => setImageDialogMounted(false), 220);
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
    };
  }, [imageDialogOpen]);

  const toggleVoiceInput = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      else recognitionRef.current?.stop();
      return;
    }
    if (canRecordAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
          .find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
        const initialText = text.trim();
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size) audioChunksRef.current.push(event.data);
        };
        recorder.onerror = (event) => {
          console.error('Audio recording failed:', event);
          showAlert(t('voiceRecognitionFailed'), 'error', currentLang);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
          mediaRecorderRef.current = null;
          const recording = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          audioChunksRef.current = [];
          setIsRecording(false);
          if (!recording.size) return;
          setIsTranscribing(true);
          try {
            const form = new FormData();
            const extension = recording.type.includes('mp4') ? 'm4a' : recording.type.includes('ogg') ? 'ogg' : 'webm';
            form.append('file', recording, `cintra-recording.${extension}`);
            form.append('language', currentLang === 'ar' ? 'ar' : 'en');
            const response = await fetch('/api/audio/transcriptions', { method: 'POST', body: form });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error?.message || 'Speech transcription failed.');
            if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No speech was detected in the recording.');
            setText(`${initialText}${initialText ? ' ' : ''}${result.text.trim()}`);
          } catch (error) {
            console.error('Could not transcribe recorded audio:', error);
            showAlert(error instanceof Error ? error.message : t('voiceRecognitionFailed'), 'error', currentLang);
          } finally {
            setIsTranscribing(false);
          }
        };
        mediaRecorderRef.current = recorder;
        setRecordingSeconds(0);
        setIsRecording(true);
        recorder.start();
        return;
      } catch (error) {
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        console.error('Could not start audio recording:', error);
        showAlert(t('voiceRecognitionFailed'), 'error', currentLang);
        return;
      }
    }
    if (!speechConstructor) return;
    const recognition = new speechConstructor();
    recognition.lang = currentLang === 'ar' ? 'ar-EG' : 'en-US';
    recognition.interimResults = true;
    const initialText = text.trim();
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join('');
      setText(`${initialText}${initialText && transcript ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = (event) => {
      console.error('Speech recognition failed:', event.error);
      setIsRecording(false);
      if (!['no-speech', 'aborted'].includes(event.error)) {
        showAlert(t('voiceRecognitionFailed'), 'error', currentLang);
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    setRecordingSeconds(0);
    setIsRecording(true);
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setIsRecording(false);
      console.error('Could not start speech recognition:', error);
    }
  };

  const formattedRecordingTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')}`;

  const applyShortcut = (instruction: string) => {
    setText((current) => current.trim() ? `${instruction}\n\n${current.trim()}` : instruction);
    setFeaturesOpen(false);
  };

  const submitImagePrompt = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onGenerateImage || imagePrompt.trim().length < 3 || imageGenerationBusy) return;
    setImageError('');
    setImageDialogOpen(false);
    onImageGeneratorOpenChange?.(false);
    try {
      await onGenerateImage(imagePrompt.trim(), { aspectRatio: imageAspectRatio, style: imageStyle });
      setImagePrompt('');
    } catch (error) {
      setImageError(error instanceof Error ? error.message : t('imageGenerationFailed'));
      setImageDialogOpen(true);
      onImageGeneratorOpenChange?.(true);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (uploadStatus === 'uploading') return;
    if (isGenerating && onStopGeneration) {
      onStopGeneration();
      return;
    }
    if ((!text.trim() && !files.length) || disabled) return;
    const message = text.trim();
    if (webSearchEnabled || hasExplicitWebSearchIntent(message)) {
      setSearchConfirmation({ message, files: [...files] });
      return;
    }
    onSendMessage(message, files, false);
    setText('');
    if (!files.length) setFiles([]);
  };

  const resolveSearchConfirmation = (webSearchConsent: boolean) => {
    if (!searchConfirmation) return;
    onSendMessage(searchConfirmation.message, searchConfirmation.files, webSearchConsent);
    setText('');
    setFiles([]);
    setSearchConfirmation(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const addFiles = (chosen: File[]): boolean => {
    if (!chosen.length || uploadStatus === 'uploading') return false;
    if (chosen.some((file) => file.size > (file.type === 'application/pdf' ? 50 : 10) * 1024 * 1024)) {
      showAlert(t('fileSizeIndividual'), 'error', currentLang);
      return false;
    }
    const next = [...files, ...chosen].slice(0, 5);
    const totalLimit = next.every((file) => file.type === 'application/pdf') ? 50 : 20;
    if (next.reduce((size, file) => size + file.size, 0) > totalLimit * 1024 * 1024) {
      showAlert(t('fileSizeCombined'), 'error', currentLang);
      return false;
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
    return true;
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text/plain');
    if (pastedText.length <= 5000) return;
    const textFile = new File(
      [pastedText],
      `bayan-pasted-text-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
      { type: 'text/plain' },
    );
    if (!addFiles([textFile])) return;
    event.preventDefault();
    showAlert(t('longTextConvertedToFile'), 'info', currentLang);
  };

  const pdfKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  const runPdfOperation = async (file: File, operation: 'extract' | 'summarize') => {
    const key = pdfKey(file);
    setPdfOperation({ key, status: 'busy', text: '' });
    try {
      let documentId = pdfDocumentIds.current.get(key);
      if (!documentId) {
        const form = new FormData();
        form.append('file', file);
        const uploadResponse = await fetch('/api/pdf/upload', { method: 'POST', body: form });
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) throw new Error(uploadData.error?.message || 'PDF upload failed.');
        const uploadedDocumentId: unknown = uploadData.document?.id;
        if (typeof uploadedDocumentId !== 'string' || !uploadedDocumentId) throw new Error('PDF upload returned an invalid document.');
        documentId = uploadedDocumentId;
        pdfDocumentIds.current.set(key, uploadedDocumentId);
        setPdfDocuments((current) => ({ ...current, [key]: uploadedDocumentId }));
      }
      const response = await fetch(`/api/pdf/${encodeURIComponent(documentId)}/${operation}`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || 'Could not process this PDF.');
      setPdfOperation({
        key,
        status: 'done',
        text: operation === 'extract' ? String(data.text || '') : String(data.summary || ''),
      });
    } catch (error) {
      setPdfOperation({ key, status: 'error', text: error instanceof Error ? error.message : 'Could not process this PDF.' });
    }
  };

  return (
    <div className={`bayan-input-shell mx-auto w-full px-4 pb-4 ${expanded ? 'max-w-6xl' : 'max-w-3xl'}`}>
      {searchConfirmation && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSearchConfirmation(null);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-confirmation-title"
            className="bayan-search-confirmation w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
              <Globe2 size={21} />
            </div>
            <h2 id="search-confirmation-title" className="text-base font-semibold">
              {currentLang === 'ar' ? 'تأكيد البحث في الويب' : 'Confirm web search'}
            </h2>
            <p className="mt-2 text-sm leading-6 opacity-75">
              {currentLang === 'ar'
                ? 'يتطلب هذا السؤال البحث في الويب لجلب معلومات محدثة. هل تريد تفعيل البحث؟ (ملاحظة: هذا الإجراء سيستهلك من الكريدت الخاص بك).'
                : 'This question needs a web search for current information. Search now? Note: this will use your search credits.'}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => resolveSearchConfirmation(false)}
                className="bayan-search-confirm-secondary rounded-xl border px-4 py-2.5 text-sm font-medium transition"
              >
                {currentLang === 'ar' ? 'لا، أجب دون بحث' : 'No, answer without search'}
              </button>
              <button
                type="button"
                onClick={() => resolveSearchConfirmation(true)}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {currentLang === 'ar' ? 'نعم، ابحث في الويب' : 'Yes, search the web'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {imageDialogMounted && (
        <form onSubmit={(event) => void submitImagePrompt(event)} role="dialog" aria-modal="true" aria-hidden={!imageDialogVisible} aria-labelledby="image-prompt-title" className={`bayan-popover-panel mb-3 rounded-2xl border border-neutral-200/70 bg-white/80 p-4 text-start shadow-xl backdrop-blur-2xl ${imageDialogVisible ? 'is-visible' : ''}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="image-prompt-title" className="text-sm font-semibold text-neutral-900">{currentLang === 'ar' ? 'استوديو الصور' : 'Cintra Image Studio'}</h2>
              <p className="mt-1 text-[11px] text-neutral-500">{currentLang === 'ar' ? 'اضبط الأبعاد والأسلوب قبل التوليد' : 'Choose a composition and style before generating'}</p>
            </div>
            <button type="button" onClick={() => { setImageDialogOpen(false); setImageError(''); onImageGeneratorOpenChange?.(false); }} disabled={imageGenerationBusy} className="rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-50">{t('close')}</button>
          </div>
          <textarea
            autoFocus
            value={imagePrompt}
            onChange={(event) => setImagePrompt(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t('imagePromptPlaceholder')}
            disabled={imageGenerationBusy}
            className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[11px] font-medium text-neutral-600">
              {currentLang === 'ar' ? 'نسبة الأبعاد' : 'Aspect ratio'}
              <select value={imageAspectRatio} onChange={(event) => setImageAspectRatio(event.target.value as typeof imageAspectRatio)} disabled={imageGenerationBusy} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800">
                <option value="1:1">1:1 · Square</option>
                <option value="16:9">16:9 · Landscape</option>
                <option value="9:16">9:16 · Portrait</option>
                <option value="4:3">4:3 · Classic</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[11px] font-medium text-neutral-600">
              {currentLang === 'ar' ? 'الأسلوب' : 'Style'}
              <select value={imageStyle} onChange={(event) => setImageStyle(event.target.value as typeof imageStyle)} disabled={imageGenerationBusy} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800">
                <option value="cinematic">Cinematic</option>
                <option value="anime">Anime</option>
                <option value="3d-render">3D Render</option>
                <option value="photorealistic">Photorealistic</option>
                <option value="watercolor">Watercolor</option>
              </select>
            </label>
          </div>
          {imageError && <p className="mt-2 text-xs text-red-600" role="alert">{imageError}</p>}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-neutral-500">{t('imageGenerationPrivacy')}</p>
            <button type="submit" disabled={imagePrompt.trim().length < 3 || imageGenerationBusy} className="bayan-accent-solid inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
              {imageGenerationBusy ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />{t('generatingImage')}</> : <><Sparkles size={14} />{t('generateImage')}</>}
            </button>
          </div>
        </form>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" aria-live="polite">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative flex min-w-24 max-w-52 items-center gap-2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-2 shadow-sm">
              {file.type.startsWith('image/') ? (
                <img src={previews[index]} alt="" className="h-10 w-10 rounded-lg object-cover" decoding="async" />
              ) : (
                <FileText size={18} className="shrink-0 text-neutral-500" />
              )}
              <span className="truncate text-xs text-neutral-700">{file.name}</span>
              {uploadProgress !== null && (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-neutral-100">
                  <span className="block h-full bg-neutral-900 transition-[width] duration-150" style={{ width: `${uploadProgress}%` }} />
                </span>
              )}
              <button type="button" disabled={uploadStatus === 'uploading'} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="absolute end-1 top-1 rounded-full bg-white/90 p-0.5 text-neutral-500 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40" aria-label={t('removeFile', { file: file.name })}>
                <X size={12} />
              </button>
            </div>
          ))}
          {files.filter((file) => file.type === 'application/pdf').map((file) => {
            const key = pdfKey(file);
            const docId = pdfDocuments[key];
            const active = pdfOperation.key === key;
            return (
              <section key={key} className="mb-2 rounded-xl border border-neutral-200 bg-white p-3 text-start">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="me-auto text-xs font-medium text-neutral-700">{file.name}</span>
                  <button type="button" disabled={active && pdfOperation.status === 'busy'} onClick={() => void runPdfOperation(file, 'extract')} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">{currentLang === 'ar' ? 'استخراج النص' : 'Extract text'}</button>
                  <button type="button" disabled={active && pdfOperation.status === 'busy'} onClick={() => void runPdfOperation(file, 'summarize')} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">{currentLang === 'ar' ? 'تلخيص' : 'Summarize'}</button>
                  {docId && <>
                    <a href={`/api/pdf/${encodeURIComponent(docId)}/preview`} target="_blank" rel="noreferrer" className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] text-neutral-700 hover:bg-neutral-50">{currentLang === 'ar' ? 'معاينة' : 'Preview'}</a>
                    <a href={`/api/pdf/${encodeURIComponent(docId)}/download`} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] text-neutral-700 hover:bg-neutral-50">{currentLang === 'ar' ? 'تنزيل PDF' : 'Download'}</a>
                  </>}
                </div>
                {active && pdfOperation.status === 'busy' && <p className="mt-2 text-xs text-neutral-500" role="status">{currentLang === 'ar' ? 'جارٍ معالجة ملف PDF…' : 'Processing PDF…'}</p>}
                {active && pdfOperation.status === 'error' && <p className="mt-2 text-xs text-red-600" role="alert">{pdfOperation.text}</p>}
                {active && pdfOperation.status === 'done' && pdfOperation.text && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-[11px] leading-5 text-neutral-700">{pdfOperation.text.slice(0, 5000)}</pre>}
              </section>
            );
          })}
        </div>
      )}
      {uploadStatus && (
        <div
          className={`relative mb-2 flex items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-xs ${
            uploadStatus === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : uploadStatus === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-neutral-200 bg-white text-neutral-600'
          }`}
          role={uploadStatus === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {uploadStatus === 'uploading'
            ? <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden="true" />
            : uploadStatus === 'success'
              ? <CircleCheck size={15} className="shrink-0" aria-hidden="true" />
              : <CircleAlert size={15} className="shrink-0" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            {uploadStatus === 'uploading'
              ? t('uploadingFile')
              : uploadStatus === 'success'
                ? t('uploadSuccess')
                : t('uploadFailed')}
          </span>
          {uploadStatus === 'uploading' && uploadProgress !== null && (
            <span className="shrink-0 tabular-nums">{uploadProgress}%</span>
          )}
          {uploadStatus === 'uploading' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
              {uploadProgress === null
                ? <span className="block h-full w-1/3 animate-pulse bg-neutral-500" />
                : <span className="block h-full bg-neutral-700 transition-[width] duration-150" style={{ width: `${uploadProgress}%` }} />}
            </span>
          )}
        </div>
      )}

      {isRecording && (
        <div className="mb-2 flex items-center justify-center gap-2 text-xs text-neutral-600" role="status" aria-live="polite">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span>{t('recording')}</span>
          <time className="font-mono tabular-nums">{formattedRecordingTime}</time>
        </div>
      )}
      {isTranscribing && (
        <div className="mb-2 flex items-center justify-center gap-2 text-xs text-neutral-600" role="status" aria-live="polite">
          <Loader2 size={14} className="animate-spin" />
          <span>{currentLang === 'ar' ? 'جارٍ تحويل التسجيل إلى نص…' : 'Transcribing recording…'}</span>
        </div>
      )}

      {showWebSearchIndicator && (
        <div className="mb-2 flex items-center gap-1.5 px-2 text-[11px] font-medium text-emerald-300" role="status" aria-live="polite">
          <Globe2 size={13} />
          <span>{currentLang === 'ar' ? 'البحث على الويب مفعّل' : 'Web search enabled'}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className={`bayan-composer flex flex-col gap-1 rounded-3xl px-2 py-2.5 transition-colors ${homeMode ? 'bayan-home-composer border-0 bg-transparent shadow-none' : 'bayan-chat-composer'}`}>
        <textarea
          ref={composerRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={disabled || uploadStatus === 'uploading'}
          aria-label={t('inputPlaceholder')}
          title={currentLang === 'ar' ? 'Enter للإرسال · Shift+Enter لسطر جديد' : 'Enter to send · Shift+Enter for a new line'}
          placeholder={t('inputPlaceholder')}
          rows={1}
          className="bayan-composer-text min-h-8 w-full min-w-0 resize-none overflow-y-hidden border-0 bg-transparent px-1 py-2 text-sm leading-6 text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:ring-0"
        />
        <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILES} disabled={disabled || uploadStatus === 'uploading'} className="hidden" onChange={(e) => addFiles(Array.from(e.target.files || []))} />
        <div className="bayan-composer-toolbar flex w-full items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <div ref={featuresRef} className="relative shrink-0">
              <button
                ref={featuresTriggerRef}
                type="button"
                onClick={() => setFeaturesOpen((open) => !open)}
                disabled={disabled || isGenerating || uploadStatus === 'uploading'}
                aria-label={t('featuresMenu')}
                aria-haspopup="menu"
                aria-expanded={featuresOpen}
                title={t('featuresMenu')}
                className={`bayan-composer-features flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${featuresOpen ? 'bayan-accent-soft' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}
              >
                <Plus size={18} className={`transition-transform duration-150 ${featuresOpen ? 'rotate-45' : ''}`} />
              </button>
            </div>
            {homeMode && (
              <button
                type="button"
                onClick={onToggleThinking}
                aria-pressed={thinkingEnabled}
                title={thinkingEnabled ? (currentLang === 'ar' ? 'تعطيل وضع التفكير' : 'Turn thinking off') : (currentLang === 'ar' ? 'تفعيل وضع التفكير' : 'Turn thinking on')}
                className={`bayan-home-think hidden h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs sm:flex ${thinkingEnabled ? 'text-neutral-300' : 'text-neutral-500 hover:text-neutral-100'}`}
              >
                <Brain size={16} />{currentLang === 'ar' ? 'فكّر' : 'Think'}
              </button>
            )}
            {homeMode && (
              <button
                type="button"
                onClick={() => void toggleVoiceInput()}
                disabled={(!speechConstructor && !canRecordAudio) || disabled || isGenerating || isTranscribing}
                aria-label={isRecording ? t('stopGenerating') : t('voiceInput')}
                title={!speechConstructor && !canRecordAudio ? t('voiceUnsupported') : t('voiceInput')}
                className={`bayan-home-mic hidden h-8 w-8 shrink-0 items-center justify-center rounded-full sm:flex ${isRecording ? 'text-red-400' : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'}`}
              >
                <Mic size={17} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={uploadStatus === 'uploading' || ((!text.trim() && !files.length && !isGenerating) || disabled)}
            title={uploadStatus === 'uploading' ? t('uploadingFile') : isGenerating ? t('stopGenerating') : t('sendMessage')}
            aria-label={uploadStatus === 'uploading' ? t('uploadingFile') : isGenerating ? t('stopGenerating') : t('sendMessage')}
            className={`bayan-composer-send flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
              text.trim() || files.length || isGenerating ? 'is-send-ready' : 'is-send-disabled'
            } ${isGenerating ? 'is-send-stop animate-stop-pulse' : ''}`}
          >
            {uploadStatus === 'uploading'
              ? <Loader2 size={15} className="animate-spin" />
              : isGenerating ? <Square size={12} className="fill-current" /> : <ArrowUp size={17} strokeWidth={2.4} />}
          </button>
        </div>
      </form>
      {featuresMounted && createPortal(
        <div
          ref={featuresMenuRef}
          role="menu"
          aria-hidden={!featuresVisible}
          aria-label={t('featuresMenu')}
          style={featuresPosition || { position: 'fixed', top: 8, left: 8, width: 288, maxHeight: '60vh', overflowY: 'auto' }}
          className={`bayan-popover-panel z-50 rounded-2xl border border-neutral-200 bg-white p-2 text-start shadow-xl ${featuresVisible ? 'is-visible' : ''}`}
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{t('modesAndTools')}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onToggleStudyMode?.(); setFeaturesOpen(false); }}
            disabled={disabled || isGenerating || !onToggleStudyMode}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm transition-colors hover:bg-neutral-50 disabled:opacity-50 ${studyMode ? 'bayan-accent-soft' : 'text-neutral-800'}`}
          >
            <GraduationCap size={17} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{studyMode ? t('studyModeExit') : t('studyMode')}</span>
              <span className="mt-0.5 block text-[11px] opacity-70">{t('studyModeDescription')}</span>
            </span>
            {studyMode && <span aria-hidden="true" className="text-xs">✓</span>}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { fileRef.current?.click(); setFeaturesOpen(false); }}
            disabled={disabled || isGenerating || files.length >= 5}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <Paperclip size={17} className="shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block font-medium">{t('attachFiles')}</span>
              <span className="mt-0.5 block text-[11px] text-neutral-500">{t('attachFileHelp')}</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { void toggleVoiceInput(); setFeaturesOpen(false); }}
            disabled={(!speechConstructor && !canRecordAudio) || disabled || isGenerating || isTranscribing}
            title={!speechConstructor && !canRecordAudio ? t('voiceUnsupported') : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <Mic size={17} className="shrink-0 text-neutral-500" />
            <span className="font-medium">{isRecording ? t('stopGenerating') : t('voiceInput')}</span>
          </button>
          <div className="my-1 border-t border-neutral-100" />
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{t('promptShortcuts')}</p>
          <button type="button" role="menuitem" onClick={() => applyShortcut(currentLang === 'ar' ? 'اشرح الموضوع التالي خطوة بخطوة، مع تبسيط المصطلحات:' : 'Explain the following step by step, defining unfamiliar terms:')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-xs text-neutral-700 transition-colors hover:bg-neutral-50">
            <Lightbulb size={15} className="shrink-0 text-neutral-500" />{t('explainStepByStep')}
          </button>
          <button type="button" role="menuitem" onClick={() => applyShortcut(currentLang === 'ar' ? 'أعطني مثالاً عملياً محلولاً على الموضوع التالي:' : 'Give me a practical worked example of the following:')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-xs text-neutral-700 transition-colors hover:bg-neutral-50">
            <BookOpen size={15} className="shrink-0 text-neutral-500" />{t('workedExample')}
          </button>
          <button type="button" role="menuitem" onClick={() => applyShortcut(currentLang === 'ar' ? 'أنشئ اختباراً قصيراً من 3 أسئلة عن الموضوع التالي، وانتظر إجابتي قبل عرض الحل:' : 'Create a short 3-question quiz about the following topic. Wait for my answers before revealing solutions:')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-xs text-neutral-700 transition-colors hover:bg-neutral-50">
            <ListChecks size={15} className="shrink-0 text-neutral-500" />{t('createQuizShortcut')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setFeaturesOpen(false); setImageError(''); setImageDialogOpen(true); }}
            disabled={!onGenerateImage || disabled || isGenerating || imageGenerationBusy}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-xs text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <Sparkles size={15} className="shrink-0 text-neutral-500" />{t('generateImage')}
          </button>
        </div>,
        document.body,
      )}

      <p className="mt-2 select-none text-center text-[11px] text-neutral-400">{t('disclaimer')}</p>
    </div>
  );
}
