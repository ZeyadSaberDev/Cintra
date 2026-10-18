import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  Search,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Download,
  FileImage,
  FileType,
  BookOpen,
  Code2,
  NotebookPen,
  ListChecks,
  CircleHelp,
  LibraryBig,
  Pencil,
  Save,
  X,
  Volume2,
  Pause,
  Play,
  Square,
  Smile,
  Loader2,
} from 'lucide-react';
import { exportResponseElement, responseFilenameBase, type ResponseExportFormat } from '../../../lib/responseExport';
import { extractGeneratedArtifacts, stripGeneratedCodeBlocks } from '../../../lib/artifacts/generatedArtifacts';

export type FeedbackRating = 'like' | 'dislike' | 'heart' | 'laugh' | 'thumbs_up' | 'celebrate' | 'thinking' | 'clap';
const messageReactions: Array<{ emoji: string; asset: string; rating: FeedbackRating; label: string; labelAr: string }> = [
  { emoji: '❤️', asset: '2764', rating: 'heart', label: 'Love', labelAr: 'أعجبني' },
  { emoji: '😂', asset: '1f602', rating: 'laugh', label: 'Funny', labelAr: 'مضحك' },
  { emoji: '👍', asset: '1f44d', rating: 'thumbs_up', label: 'Helpful', labelAr: 'مفيد' },
  { emoji: '🎉', asset: '1f389', rating: 'celebrate', label: 'Celebrate', labelAr: 'رائع' },
  { emoji: '🤔', asset: '1f914', rating: 'thinking', label: 'Interesting', labelAr: 'مثير للاهتمام' },
  { emoji: '👏', asset: '1f44f', rating: 'clap', label: 'Well done', labelAr: 'أحسنت' },
];

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  previewUrl?: string;
  uploadState?: 'uploading' | 'complete' | 'failed';
  uploadProgress?: number | null;
}

export interface ChatMessageDisplay {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string | null;
  createdAt?: string;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  studyMode?: boolean;
  autoExportPdf?: boolean;
  imageProgress?: number;
  imageProgressComplete?: boolean;
  editedAt?: string;
  isPriorHistory?: boolean;
  searchActivity?: {
    status: 'searching' | 'results' | 'empty' | 'failed';
    sources: Array<{ title: string; url: string }>;
  };
}

interface MessageItemProps {
  message: ChatMessageDisplay;
  userName?: string | null;
  isThinking?: boolean;
  readOnly?: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, content: string) => boolean | void | Promise<boolean | void>;
  onFeedback?: (messageId: string, rating: FeedbackRating) => void;
  studyMode?: boolean;
  highlightUserMessages?: boolean;
  highlightAssistantAnswers?: boolean;
  userMessageHighlightColor?: string;
  assistantAnswerHighlightColor?: string;
  ttsVoice?: string;
  ttsSpeed?: number;
  preferredLanguage?: string;
  onRegenerateImage?: () => void;
  onEditImage?: () => void;
  onDeleteImage?: (attachmentId: string) => void;
  onOpenArtifacts?: (messageId: string, artifactId?: string) => void;
}

function MessageItemComponent({
  message,
  isThinking = false,
  readOnly = false,
  onRegenerate,
  onFeedback,
  onEditMessage,
  studyMode = message.studyMode ?? false,
  highlightUserMessages = true,
  highlightAssistantAnswers = true,
  userMessageHighlightColor = '#818cf8',
  assistantAnswerHighlightColor = '#fbbf24',
  ttsVoice = '',
  ttsSpeed = 1,
  preferredLanguage = 'en-US',
  onRegenerateImage,
  onEditImage,
  onDeleteImage,
  onOpenArtifacts,
}: MessageItemProps) {
  const { t, currentLang } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [reaction, setReaction] = useState<FeedbackRating | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<React.CSSProperties | null>(null);
  const reactionButtonRef = React.useRef<HTMLButtonElement>(null);
  const reactionPickerRef = React.useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState('');
  const [studyExpanded, setStudyExpanded] = useState(false);
  const [studyArtifacts, setStudyArtifacts] = useState<Record<string, string>>({});
  const [studyNotes, setStudyNotes] = useState<Array<{ id: string; highlightedText: string; userNote: string }>>([]);
  const [studyBusy, setStudyBusy] = useState<'summary' | 'quiz' | 'resources' | 'grade' | 'saving note' | null>(null);
  const [studyError, setStudyError] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [quizAnswers, setQuizAnswers] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const autoExportStarted = React.useRef(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [audioDownloadBusy, setAudioDownloadBusy] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; name: string } | null>(null);
  const generatedArtifacts = React.useMemo(() => extractGeneratedArtifacts(message.content), [message.content]);
  const generatedCodeArtifacts = React.useMemo(
    () => generatedArtifacts.filter((artifact) => !['markdown', 'text'].includes(artifact.kind)),
    [generatedArtifacts],
  );
  const messageTextWithoutCode = React.useMemo(() => stripGeneratedCodeBlocks(message.content), [message.content]);

  React.useEffect(() => {
    const previewUrls = (message.attachments || [])
      .map((attachment) => attachment.previewUrl)
      .filter((url): url is string => Boolean(url));
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [message.id]);

  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) return;
    const synthesis = window.speechSynthesis;
    if (synthesis.speaking && !synthesis.paused) {
      synthesis.pause();
      setSpeechPaused(true);
      return;
    }
    if (synthesis.paused) {
      synthesis.resume();
      setSpeechPaused(false);
      setSpeechActive(true);
      return;
    }
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.lang = preferredLanguage;
    utterance.rate = ttsSpeed;
    const selectedVoice = synthesis.getVoices().find((voice) => voice.name === ttsVoice);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onstart = () => { setSpeechActive(true); setSpeechPaused(false); };
    utterance.onend = () => { setSpeechActive(false); setSpeechPaused(false); };
    utterance.onerror = () => { setSpeechActive(false); setSpeechPaused(false); };
    synthesis.speak(utterance);
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setSpeechActive(false);
    setSpeechPaused(false);
  };

  React.useEffect(() => {
    if (!isEditing) setEditText(message.content);
  }, [isEditing, message.content]);

  React.useEffect(() => {
    if (!reactionPickerOpen) return;
    const updatePosition = () => {
      const trigger = reactionButtonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(272, window.innerWidth - margin * 2);
      const rtl = document.documentElement.dir === 'rtl';
      const alignedLeft = rtl ? rect.right - width : rect.left;
      const left = Math.max(margin, Math.min(alignedLeft, window.innerWidth - width - margin));
      const top = rect.top >= 56 ? rect.top - 48 : Math.min(rect.bottom + 8, window.innerHeight - 48 - margin);
      setReactionPickerPosition({ position: 'fixed', left, top, width: 'max-content', maxWidth: `calc(100vw - ${margin * 2}px)` });
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node
        && !reactionButtonRef.current?.contains(event.target)
        && !reactionPickerRef.current?.contains(event.target)
      ) setReactionPickerOpen(false);
    };
    updatePosition();
    document.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [reactionPickerOpen]);

  React.useEffect(() => {
    if (!studyMode || readOnly || message.role !== 'assistant' || message.isStreaming || !message.id || message.id.startsWith('asst_')) return;
    const controller = new AbortController();
    fetch(`/api/study/messages/${encodeURIComponent(message.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) return null;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || t('couldNotLoadStudyMaterials'));
        return data;
      })
      .then((data) => {
        if (!data) return;
        const artifacts: Record<string, string> = {};
        for (const artifact of data.artifacts as Array<{ kind: string; content: string }>) artifacts[artifact.kind] = artifact.content;
        setStudyArtifacts(artifacts);
        setStudyNotes(data.notes || []);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Study materials request failed:', error);
          setStudyError(error.message);
        }
      });
    return () => controller.abort();
  }, [studyMode, readOnly, message.id, message.isStreaming, message.role]);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2000);
  };

  const copy = async (text: string) => {
    try {
      if (text.length >= 500) {
        showToast(t('generatingTextFile'));
        const filename = `${responseFilenameBase()}.txt`;
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(t('fileDownloaded', { filename }));
        return;
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast(t('copiedToClipboard'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Could not copy message:', error);
      showToast(t('exportFailed'));
    }
  };

  const copyResponse = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      showToast(t('copiedToClipboard'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Could not copy response:', error);
      showToast(t('exportFailed'));
    }
  };

  const copyUserMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      showToast(t('copiedToClipboard'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Could not copy user message:', error);
      showToast(t('exportFailed'));
    }
  };

  const downloadText = (text: string) => {
    const filename = `${responseFilenameBase()}.txt`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t('fileDownloaded', { filename }));
  };

  const downloadGeneratedArtifact = (artifact: (typeof generatedCodeArtifacts)[number]) => {
    const contentType = artifact.kind === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
    const url = URL.createObjectURL(new Blob([artifact.content], { type: contentType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadSpeechAudio = async () => {
    setAudioDownloadBusy(true);
    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, preferredLanguage, speed: ttsSpeed, ...(ttsVoice ? { voice: ttsVoice } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || 'Audio generation failed.');
      const anchor = document.createElement('a');
      anchor.href = `/api/conversation/audio/${encodeURIComponent(message.id)}`;
      anchor.download = `bayan-${message.id}.mp3`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showToast(currentLang === 'ar' ? 'تم تنزيل الملف الصوتي.' : 'Audio downloaded.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : (currentLang === 'ar' ? 'تعذر إنشاء الملف الصوتي.' : 'Could not generate audio.'));
    } finally {
      setAudioDownloadBusy(false);
    }
  };

  const downloadVisualResponse = async (format: ResponseExportFormat) => {
    setExportMenuOpen(false);
    const messageElement = Array.from(document.querySelectorAll<HTMLElement>('[data-message-id]'))
      .find((element) => element.dataset.messageId === message.id);
    const contentElement = messageElement?.querySelector<HTMLElement>('[data-export-content]');
    if (!contentElement) {
      showToast(t('exportFailed'));
      return;
    }

    showToast(t('preparingExport', { format: format.toUpperCase() }));
    try {
      const filename = responseFilenameBase();
      await exportResponseElement(contentElement, format, filename);
      showToast(t('fileDownloaded', { filename: `${filename}.${format}` }));
    } catch (error) {
      console.error(`Could not export response as ${format}:`, error);
      showToast(t('exportFailed'));
    }
  };

  React.useEffect(() => {
    if (!message.autoExportPdf || message.isStreaming || !message.content || autoExportStarted.current) return;
    autoExportStarted.current = true;
    const frame = window.requestAnimationFrame(() => void downloadVisualResponse('pdf'));
    return () => window.cancelAnimationFrame(frame);
  }, [message.autoExportPdf, message.isStreaming, message.content]);

  const generateStudyArtifact = async (kind: 'summary' | 'quiz' | 'resources' | 'grade', answers?: string) => {
    setStudyBusy(kind);
    setStudyError('');
    try {
      const response = await fetch('/api/study/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, kind, answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || t('couldNotGenerateStudyMaterial'));
      const artifactKind = kind === 'grade' ? 'quizResult' : kind;
      setStudyArtifacts((current) => ({ ...current, [artifactKind]: data.artifact.content }));
    } catch (error) {
      console.error('Study material generation failed:', error);
      setStudyError(error instanceof Error ? error.message : t('couldNotGenerateStudyMaterial'));
    } finally {
      setStudyBusy(null);
    }
  };

  const saveStudyNote = async () => {
    if (!selectedText || !noteText.trim()) return;
    setStudyBusy('saving note');
    setStudyError('');
    try {
      const response = await fetch('/api/study/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, highlightedText: selectedText, userNote: noteText.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || t('couldNotSaveStudyNote'));
      setStudyNotes((current) => [data.note, ...current]);
      setSelectedText('');
      setNoteText('');
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      console.error('Study note save failed:', error);
      setStudyError(error instanceof Error ? error.message : t('couldNotSaveStudyNote'));
    } finally {
      setStudyBusy(null);
    }
  };

  const keyPoints = Array.from(new Set(
    (message.content.match(/[\p{L}\p{N}][\p{L}\p{N}-]{4,}/gu) || [])
      .filter((word) => !/^(about|which|there|their|these|those|would|could|should|while|where|after|before|because|important|response|example|however)$/i.test(word)),
  )).slice(0, 5);

  const handleTextSelection = () => {
    const selection = window.getSelection()?.toString().trim() || '';
    if (selection && message.content.includes(selection)) setSelectedText(selection.slice(0, 5000));
  };

  const attachmentList = message.attachments?.length ? (
    <div className="mb-2 flex flex-wrap gap-2">
      {message.attachments.map((attachment) => {
        const isImage = attachment.fileType.startsWith('image/');
        const isUploading = attachment.uploadState === 'uploading';
        const uploadFailed = attachment.uploadState === 'failed';
        const attachmentUrl = attachment.uploadState === 'failed' && attachment.previewUrl
          || `/api/attachments/${encodeURIComponent(attachment.id)}`;
        const extension = attachment.fileName.split('.').pop()?.slice(0, 5).toUpperCase() || 'FILE';
        const card = (
          <div className="group/file relative w-56 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white text-start shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md">
            {isImage ? (
              <div className="flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-white to-violet-50">
                <img src={attachment.previewUrl || attachmentUrl} alt={attachment.fileName} className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-50">
                <div className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-indigo-600 shadow-sm">
                  <FileText size={23} strokeWidth={1.8} />
                  <span className="mt-0.5 text-[8px] font-bold tracking-wider">{extension}</span>
                </div>
              </div>
            )}
            <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-800" title={attachment.fileName}>{attachment.fileName}</p>
                <p className="mt-0.5 text-[10px] text-neutral-500">{Math.max(1, Math.ceil(attachment.fileSize / 1024))} KB</p>
              </div>
              {isUploading ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-medium text-indigo-700">
                  <Loader2 size={11} className="animate-spin" />
                  {attachment.uploadProgress == null
                    ? (currentLang === 'ar' ? 'جارٍ الرفع' : 'Uploading')
                    : `${attachment.uploadProgress}%`}
                </span>
              ) : uploadFailed ? (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-[9px] font-medium text-red-700">
                  {currentLang === 'ar' ? 'تعذّر الرفع' : 'Upload failed'}
                </span>
              ) : null}
            </div>
            {isUploading && (
              <div className="h-1 w-full overflow-hidden bg-indigo-50" aria-hidden="true">
                {attachment.uploadProgress == null ? (
                  <span className="block h-full w-1/3 animate-pulse bg-indigo-500" />
                ) : (
                  <span className="block h-full bg-indigo-500 transition-[width] duration-150" style={{ width: `${attachment.uploadProgress}%` }} />
                )}
              </div>
            )}
          </div>
        );
        return (
          <div key={attachment.id} className="flex flex-col items-start">
            {isUploading ? card : (
              <a href={attachmentUrl} target="_blank" rel="noreferrer" className="block max-w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                {card}
              </a>
            )}
            {isImage && !isUploading && !uploadFailed && (
              <div className="mt-1 flex items-center gap-1">
                <a href={attachmentUrl} download={attachment.fileName} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                  <Download size={12} /> {currentLang === 'ar' ? 'تنزيل الصورة' : 'Download image'}
                </a>
                <button type="button" onClick={() => setZoomedImage({ url: attachmentUrl, name: attachment.fileName })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                  {currentLang === 'ar' ? 'تكبير' : 'View large'}
                </button>
                {onEditImage && (
                  <button type="button" onClick={onEditImage} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                    {currentLang === 'ar' ? 'تعديل الطلب' : 'Edit prompt'}
                  </button>
                )}
                {attachment.fileName.startsWith('bayan-image-') && onDeleteImage && (
                  <button type="button" onClick={() => onDeleteImage(attachment.id)} className="rounded-md px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">
                    {currentLang === 'ar' ? 'حذف' : 'Delete'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  ) : null;

  if (message.role === 'user') {
    return (
      <div className="animate-message-user my-4 flex w-full flex-col items-start">
        <div
          dir="auto"
          style={{ '--bayan-user-highlight-color': userMessageHighlightColor } as React.CSSProperties}
          className={`bayan-user-message max-w-[88%] break-words rounded-2xl rounded-tr-xs px-4 py-3 text-sm rtl:rounded-tr-2xl rtl:rounded-tl-xs ${highlightUserMessages ? 'is-highlighted' : 'is-plain'}`}
        >
          {attachmentList}
          {message.isPriorHistory && <p className="mb-2 text-[11px] text-neutral-500">{t('historyBeforeEdit')}</p>}
          {isEditing ? (
            <form className="bayan-message-edit rounded-2xl p-3.5 sm:p-4" onSubmit={async (event) => {
              event.preventDefault();
              const content = editText.trim();
              if (!content || !onEditMessage || isSavingEdit) return;
              setIsSavingEdit(true);
              try {
                const started = await onEditMessage(message.id, content);
                if (started !== false) setIsEditing(false);
              } finally {
                setIsSavingEdit(false);
              }
            }}>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[var(--bayan-accent)]">
                <Pencil size={13} />
                <span>{currentLang === 'ar' ? 'تعديل رسالتك' : 'Edit your message'}</span>
              </div>
              <textarea
                autoFocus
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                maxLength={20000}
                rows={Math.min(8, Math.max(3, editText.split('\n').length))}
                aria-label={t('editMessage')}
                className="bayan-message-edit-text max-h-60 min-h-24 w-full resize-y rounded-xl border border-[var(--bayan-border)] bg-[var(--bayan-bg)] px-3 py-2.5 text-sm leading-relaxed outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--bayan-accent)]/25"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setEditText(message.content); }}
                  title={t('cancelEdit')}
                  aria-label={t('cancelEdit')}
                  disabled={isSavingEdit}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-[var(--bayan-muted)] transition-colors hover:bg-black/5 disabled:opacity-50"
                >
                  <X size={15} />
                  <span>{t('cancelEdit')}</span>
                </button>
                <button
                  type="submit"
                  disabled={!editText.trim() || isSavingEdit}
                  title={t('saveEdit')}
                  aria-label={t('saveEdit')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--bayan-accent)] px-4 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-50"
                >
                  {isSavingEdit ? <span className="bayan-thinking-spinner" aria-hidden="true" /> : <Check size={14} />}
                  <span>{t('saveEdit')}</span>
                </button>
              </div>
            </form>
          ) : (
            message.content && <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          )}
        </div>
        {!readOnly && !isEditing && (
          <div className="mt-1 flex items-center gap-1 text-neutral-400">
            <button
              type="button"
              onClick={() => void copyUserMessage()}
              title={t('copyMessage')}
              aria-label={t('copyMessage')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bayan-surface)] hover:text-[var(--bayan-text)]"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {onEditMessage && (
              <button
                type="button"
                onClick={() => { setEditText(message.content); setIsEditing(true); }}
                title={t('editMessage')}
                aria-label={t('editMessage')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bayan-surface)] hover:text-[var(--bayan-text)]"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group animate-message-assistant my-5 flex w-full flex-col items-stretch" data-message-id={message.id}>
      <div className="bayan-assistant-byline mb-2 flex min-w-0 items-center gap-2 text-xs">
        <img src="/cintra-icon.svg" alt="" aria-hidden="true" className="bayan-assistant-brand-icon h-[22px] w-[22px] shrink-0 rounded-md object-cover" />
        <span className="bayan-assistant-brand-name shrink-0 font-semibold">Cintra</span>
        {message.isPriorHistory && <span className="ms-1 truncate text-[11px] text-neutral-500">{t('historyBeforeEdit')}</span>}
      </div>

      <div className="w-full text-start text-sm font-normal text-neutral-900">
        {attachmentList}
        {message.searchActivity && (
          <section className="mb-3 rounded-xl border border-indigo-200/70 bg-indigo-50/70 px-3 py-2.5 text-xs text-indigo-950" aria-label={currentLang === 'ar' ? 'أداة البحث على الويب' : 'Web search tool'}>
            <div className="flex items-center gap-2 font-medium">
              <Search size={14} aria-hidden="true" />
              <span>
                {message.searchActivity.status === 'searching'
                  ? (currentLang === 'ar' ? 'يبحث Cintra على الويب...' : 'Cintra is searching the web…')
                  : message.searchActivity.status === 'results'
                    ? (currentLang === 'ar' ? `تم البحث · ${message.searchActivity.sources.length} مصادر` : `Web search · ${message.searchActivity.sources.length} sources`)
                    : message.searchActivity.status === 'empty'
                      ? (currentLang === 'ar' ? 'لم يعثر البحث على مصادر مناسبة' : 'No relevant sources found')
                      : (currentLang === 'ar' ? 'تعذر إكمال البحث على الويب' : 'Web search could not be completed')}
              </span>
              {message.searchActivity.status === 'searching' && <span className="bayan-response-dots" aria-hidden="true"><i /><i /><i /></span>}
            </div>
            {message.searchActivity.sources.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                {message.searchActivity.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-indigo-700 underline underline-offset-2 hover:text-indigo-900">
                      <span className="max-w-64 truncate">{source.title}</span>
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <div data-export-content dir="auto" className="bayan-assistant-message markdown-content min-w-0 max-w-full leading-relaxed" onMouseUp={studyMode ? handleTextSelection : undefined}>
          {message.imageProgressComplete && (
            <div className="mb-3 max-w-md rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800" role="status">
              <div className="flex items-center justify-between gap-3">
                <span>{currentLang === 'ar' ? 'اكتمل إنشاء الصورة' : 'Image generation complete'}</span>
                <span className="font-semibold">100%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full w-full rounded-full bg-emerald-500" /></div>
            </div>
          )}
          {message.isStreaming && !message.content ? (
            message.id.startsWith('image_pending_') ? (
              <div className="cintra-image-skeleton" role="status" aria-label={currentLang === 'ar' ? 'جارٍ إنشاء الصورة' : 'Generating image'}>
                <div className="cintra-image-skeleton-shimmer" />
                  <div className="mt-3 space-y-2 text-xs text-neutral-500">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="bayan-response-dots" aria-hidden="true"><i /><i /><i /></span>
                        {currentLang === 'ar' ? 'يُنشئ Cintra صورتك...' : 'Cintra is creating your image…'}
                      </span>
                      <span className="font-medium tabular-nums">{Math.min(90, message.imageProgress || 5)}% · {currentLang === 'ar' ? 'تقديري' : 'estimated'}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200/80">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500" style={{ width: `${Math.min(90, message.imageProgress || 5)}%` }} />
                    </div>
                  </div>
              </div>
            ) : (
              <div className="bayan-response-status flex items-center gap-2 py-2 text-xs" role="status" aria-label={isThinking ? t('thinking') : t('generating')}>
                <img src="/cintra-icon.svg" alt="" aria-hidden="true" className="h-6 w-6 animate-pulse rounded-md object-cover" />
                <span className="bayan-generating-label font-medium">
                  {isThinking ? t('thinking') : t('generating')}
                </span>
                <span className="bayan-response-dots" aria-hidden="true"><i /><i /><i /></span>
              </div>
            )
          ) : (
            <>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              code: ({ className, children, ...props }) => {
                const isBlock = Boolean(className?.includes('language-'));
                return isBlock
                  ? <code dir="ltr" className={className} {...props}>{children}</code>
                  : <code dir="ltr" className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em]" {...props}>{children}</code>;
              },
              pre: () => null,
              p: ({ children }) => <p className="my-2">{children}</p>,
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => (
                <strong
                  style={{ '--bayan-answer-highlight-color': assistantAnswerHighlightColor } as React.CSSProperties}
                  className={highlightAssistantAnswers
                    ? 'bayan-answer-highlight box-decoration-clone rounded px-1 font-semibold'
                    : 'font-semibold'}
                >
                  {children}
                </strong>
              ),
              em: ({ children }) => <em>{children}</em>,
              del: ({ children }) => <del>{children}</del>,
              h1: ({ children }) => <h1 className="my-4 text-2xl font-semibold">{children}</h1>,
              h2: ({ children }) => <h2 className="my-3 text-xl font-semibold">{children}</h2>,
              h3: ({ children }) => <h3 className="my-3 text-lg font-semibold">{children}</h3>,
              a: ({ href, children }) => (
                <a href={href} target={href?.startsWith('/') && !href.startsWith('//') ? undefined : '_blank'} rel="noreferrer" className="text-blue-500 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 hover:decoration-blue-500">
                  {children}
                </a>
              ),
              blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-neutral-300 pl-4 text-neutral-600 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-4">{children}</blockquote>,
              td: ({ children }) => <td className="border border-neutral-200 px-3 py-2">{children}</td>,
              th: ({ children }) => <th className="border border-neutral-200 bg-neutral-50 px-3 py-2 font-semibold">{children}</th>,
              ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6 rtl:pl-0 rtl:pr-6">{children}</ul>,
              ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6 rtl:pl-0 rtl:pr-6">{children}</ol>,
              table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto"><table className="w-full border-collapse text-start">{children}</table></div>,
            }}
          >
            {messageTextWithoutCode}
          </ReactMarkdown>
          {message.isStreaming && <span className="bayan-streaming-caret" aria-hidden="true" />}
          {!message.isStreaming && generatedCodeArtifacts.length > 0 && (
            <div className="mt-3 grid max-w-xl gap-2">
              {generatedCodeArtifacts.map((artifact) => (
                <article key={artifact.id} className="bayan-generated-file-card flex min-w-0 items-center gap-3 rounded-xl border p-3 shadow-sm">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                    <Code2 size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold" title={artifact.filename}>{artifact.filename}</p>
                    <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide opacity-60">{artifact.language || artifact.kind}</p>
                  </div>
                  {onOpenArtifacts && (
                    <button
                      type="button"
                      onClick={() => onOpenArtifacts(message.id, artifact.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-medium transition hover:bg-indigo-500/10"
                    >
                      <Code2 size={14} />
                      <span className="hidden sm:inline">{currentLang === 'ar' ? 'فتح في المحرر' : 'Open editor'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadGeneratedArtifact(artifact)}
                    title={currentLang === 'ar' ? 'تحميل الملف' : 'Download file'}
                    aria-label={`${currentLang === 'ar' ? 'تحميل الملف' : 'Download file'} ${artifact.filename}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-medium transition hover:bg-indigo-500/10"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">{currentLang === 'ar' ? 'تحميل' : 'Download'}</span>
                  </button>
                </article>
              ))}
            </div>
          )}
            </>
          )}
        </div>

      </div>

      {!readOnly && studyMode && !message.isStreaming && message.content && (
        <section className="mt-3 w-full pl-9 rtl:pl-0 rtl:pr-9">
          <button
            type="button"
            disabled={studyBusy !== null}
            onClick={() => void generateStudyArtifact('summary')}
            className="me-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 transition-colors hover:bg-indigo-100 disabled:opacity-50"
          >
            <NotebookPen size={14} /> {t('summary')}
          </button>
          <button
            type="button"
            onClick={() => setStudyExpanded((open) => !open)}
            aria-expanded={studyExpanded}
            className="flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 transition-colors hover:bg-indigo-100"
          >
            <BookOpen size={14} />
            {studyExpanded ? t('hideStudyTools') : t('showStudyTools')}
            <span className="text-[10px] text-indigo-500">· {t('copyDisabled')}</span>
          </button>

          {studyExpanded && (
            <div className="mt-3 space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-3 sm:p-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={studyBusy !== null} onClick={() => void generateStudyArtifact('quiz')} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50">
                  <CircleHelp size={14} /> {t('quizMe')}
                </button>
                <button type="button" disabled={studyBusy !== null} onClick={() => void generateStudyArtifact('resources')} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50">
                  <LibraryBig size={14} /> {t('suggestedReading')}
                </button>
                {studyBusy && <span className="self-center text-xs text-neutral-500" role="status">{t('generatingStudyMaterial', { kind: t(studyBusy === 'saving note' ? 'notes' : studyBusy) })}</span>}
              </div>

              {studyError && <p className="text-xs text-red-600" role="alert">{studyError}</p>}

              <details className="group rounded-xl border border-neutral-200 bg-white p-3" open>
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-neutral-800">
                  <ListChecks size={14} className="text-indigo-600" /> {t('keyPoints')}
                  <span className="ms-auto text-[10px] font-normal text-neutral-400">{t('collapse')}</span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {keyPoints.length ? keyPoints.map((point) => (
                    <span key={point} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-800">{point}</span>
                  )) : <span className="text-xs text-neutral-500">{t('selectSentence')}</span>}
                </div>
              </details>

              {studyArtifacts.summary && (
                <details className="rounded-xl border border-neutral-200 bg-white p-3" open>
                  <summary className="cursor-pointer text-xs font-semibold text-neutral-800">📝 {t('summary')}</summary>
                  <div className="mt-2 text-xs leading-6 text-neutral-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{studyArtifacts.summary}</ReactMarkdown></div>
                </details>
              )}

              {studyArtifacts.quiz && (
                <details className="rounded-xl border border-neutral-200 bg-white p-3" open>
                  <summary className="cursor-pointer text-xs font-semibold text-neutral-800">❓ {t('quizMe')}</summary>
                  <div className="mt-2 text-xs leading-6 text-neutral-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{studyArtifacts.quiz}</ReactMarkdown></div>
                  <label className="mt-3 block text-xs font-medium text-neutral-700">
                    {t('yourAnswers')}
                    <textarea rows={3} value={quizAnswers} onChange={(event) => setQuizAnswers(event.target.value)} placeholder={t('writeAnswers')} className="mt-1 w-full rounded-lg border border-neutral-200 bg-white p-2 text-xs outline-none focus:border-indigo-400" />
                  </label>
                  <button type="button" disabled={!quizAnswers.trim() || studyBusy !== null} onClick={() => void generateStudyArtifact('grade', `${studyArtifacts.quiz}\n\nStudent answers:\n${quizAnswers}`)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50">
                    {t('checkAnswers')}
                  </button>
                  {studyArtifacts.quizResult && <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs leading-6 text-emerald-900"><ReactMarkdown remarkPlugins={[remarkGfm]}>{studyArtifacts.quizResult}</ReactMarkdown></div>}
                </details>
              )}

              {studyArtifacts.resources && (
                <details className="rounded-xl border border-neutral-200 bg-white p-3" open>
                  <summary className="cursor-pointer text-xs font-semibold text-neutral-800">📚 {t('suggestedReading')}</summary>
                  <div className="mt-2 text-xs leading-6 text-neutral-700 [&_a]:text-blue-600 [&_a]:underline"><ReactMarkdown remarkPlugins={[remarkGfm]}>{studyArtifacts.resources}</ReactMarkdown></div>
                </details>
              )}

              <details className="rounded-xl border border-neutral-200 bg-white p-3" open={Boolean(selectedText || studyNotes.length)}>
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-neutral-800">
                  <NotebookPen size={14} className="text-amber-600" /> {t('notes')}
                  <span className="ms-auto text-[10px] font-normal text-neutral-400">{t('selectTextToHighlight')}</span>
                </summary>
                {selectedText ? (
                  <div className="mt-2 rounded-lg bg-amber-50 p-2.5">
                    <p className="border-s-2 border-amber-400 ps-2 text-xs leading-5 text-neutral-800">{selectedText}</p>
                    <label className="mt-2 block text-xs text-neutral-600">
                      {t('yourNote')}
                      <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder={t('notePlaceholder')} className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-amber-400" />
                    </label>
                    <button type="button" disabled={!noteText.trim() || studyBusy !== null} onClick={() => void saveStudyNote()} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50">
                      <Save size={13} /> {t('saveNote')}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-neutral-500">{t('selectSentence')}</p>
                )}
                {studyNotes.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {studyNotes.map((note) => (
                      <li key={note.id} className="rounded-lg bg-amber-50/70 p-2.5">
                        <p className="border-s-2 border-amber-400 ps-2 text-xs leading-5 text-neutral-700">{note.highlightedText}</p>
                        <p className="mt-1 text-xs font-medium text-neutral-800">{note.userNote}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </div>
          )}
        </section>
      )}

      {!readOnly && !message.isStreaming && message.content && (
        <div className="bayan-message-tools mt-2.5 flex flex-wrap items-center gap-1 text-neutral-500">
          {'speechSynthesis' in window && (
            <>
              <button type="button" onClick={toggleSpeech} title={speechPaused ? (currentLang === 'ar' ? 'استئناف القراءة' : 'Resume speech') : speechActive ? (currentLang === 'ar' ? 'إيقاف مؤقت' : 'Pause speech') : (currentLang === 'ar' ? 'استمع إلى الرد' : 'Read response aloud')} aria-label={speechPaused ? 'Resume speech' : speechActive ? 'Pause speech' : 'Read response aloud'} className="cursor-pointer rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900">
                {speechActive && !speechPaused ? <Pause size={14} /> : speechPaused ? <Play size={14} /> : <Volume2 size={14} />}
              </button>
              {speechActive && <button type="button" onClick={stopSpeech} title={currentLang === 'ar' ? 'إيقاف القراءة' : 'Stop speech'} aria-label="Stop speech" className="cursor-pointer rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900"><Square size={13} /></button>}
              {speechActive && !speechPaused && <span className="flex h-4 items-center gap-0.5" aria-label="Speaking" role="status">{[0, 1, 2, 3, 4].map((bar) => <i key={bar} className="w-0.5 animate-pulse rounded-full bg-indigo-500" style={{ height: `${7 + (bar % 3) * 3}px`, animationDelay: `${bar * 90}ms` }} />)}</span>}
            </>
          )}
          {!studyMode && (
            <button
              type="button"
              onClick={() => void copyResponse()}
              title={copied ? t('copiedToClipboard') : t('copyMessage')}
              aria-label={copied ? t('copiedToClipboard') : t('copyMessage')}
              className="rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
          <button type="button" disabled={audioDownloadBusy} onClick={() => void downloadSpeechAudio()} title={currentLang === 'ar' ? 'تنزيل الرد كملف صوتي' : 'Download response audio'} aria-label={currentLang === 'ar' ? 'تنزيل الرد كملف صوتي' : 'Download response audio'} className="cursor-pointer rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50">
            {audioDownloadBusy ? <span className="block h-3.5 w-3.5 animate-spin rounded-full border border-neutral-400 border-t-transparent" /> : <Download size={14} />}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen((open) => !open)}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              title={t('copyDownload')}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md p-1 text-[10px] transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              {copied ? <Check size={14} className="text-neutral-900" /> : <Download size={14} />}
              <span>{t('copyDownload')}</span>
            </button>
            {exportMenuOpen && (
              <div role="menu" className="absolute bottom-full left-0 z-20 mb-1 min-w-40 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg rtl:left-auto rtl:right-0">
                {!studyMode && (
                  <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); void copy(message.content); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-xs text-neutral-700 hover:bg-neutral-50">
                    <Copy size={14} /> {t('copyText')}
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); downloadText(message.content); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-xs text-neutral-700 hover:bg-neutral-50">
                  <FileText size={14} /> {t('downloadText')}
                </button>
                <button type="button" role="menuitem" onClick={() => void downloadVisualResponse('png')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-xs text-neutral-700 hover:bg-neutral-50">
                  <FileImage size={14} /> {t('downloadImage')}
                </button>
                <button type="button" role="menuitem" onClick={() => void downloadVisualResponse('pdf')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-xs text-neutral-700 hover:bg-neutral-50">
                  <FileType size={14} /> {t('downloadPdf')}
                </button>
              </div>
            )}
          </div>
          {onRegenerate && (
            <button type="button" onClick={onRegenerate} title={t('regenerateAnswer')} aria-label={t('regenerateAnswer')} className="cursor-pointer rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <RotateCcw size={14} />
            </button>
          )}
          {message.attachments?.some((attachment) => attachment.fileType.startsWith('image/')) && onRegenerateImage && (
            <button type="button" onClick={onRegenerateImage} title={currentLang === 'ar' ? 'إعادة إنشاء الصورة' : 'Regenerate image'} aria-label={currentLang === 'ar' ? 'إعادة إنشاء الصورة' : 'Regenerate image'} className="cursor-pointer rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900">
              <RotateCcw size={14} />
            </button>
          )}
          {onFeedback && (
            <div className="relative">
              <button
                ref={reactionButtonRef}
                type="button"
                onClick={() => setReactionPickerOpen((open) => !open)}
                aria-label={currentLang === 'ar' ? 'التفاعل بإيموجي' : 'React with emoji'}
                aria-expanded={reactionPickerOpen}
                title={currentLang === 'ar' ? 'التفاعل بإيموجي' : 'React with emoji'}
                className={`cursor-pointer rounded-md px-1 py-0.5 transition-colors hover:bg-neutral-100 hover:text-neutral-900 ${reaction ? 'text-neutral-900' : ''}`}
              >
                {reaction ? (
                  <img
                    src={`/emoji/${messageReactions.find((item) => item.rating === reaction)?.asset}.svg`}
                    alt=""
                    aria-hidden="true"
                    className="bayan-reaction-selected-emoji"
                  />
                ) : <Smile size={14} />}
              </button>
              {reactionPickerOpen && reactionPickerPosition && createPortal(
                <div ref={reactionPickerRef} style={reactionPickerPosition} role="group" aria-label={currentLang === 'ar' ? 'اختر إيموجي للتفاعل' : 'Choose an emoji reaction'} className="bayan-reaction-menu z-[100] flex items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                  {messageReactions.map(({ emoji, asset, rating, label, labelAr }) => (
                    <button
                      key={rating}
                      type="button"
                      aria-label={currentLang === 'ar' ? `${labelAr} ${emoji}` : `${label} reaction ${emoji}`}
                      aria-pressed={reaction === rating}
                      title={currentLang === 'ar' ? labelAr : label}
                      onClick={() => {
                        if (reaction === rating) {
                          setReaction(null);
                          setReactionPickerOpen(false);
                          return;
                        }
                        setReaction(rating);
                        setReactionPickerOpen(false);
                        onFeedback(message.id, rating);
                      }}
                      className={`bayan-reaction-option grid h-9 w-9 place-items-center rounded-xl text-lg transition-colors hover:bg-neutral-100 ${reaction === rating ? 'is-selected' : ''}`}
                    >
                      <img src={`/emoji/${asset}.svg`} alt="" aria-hidden="true" className="bayan-reaction-emoji" />
                    </button>
                  ))}
                  {reaction && (
                    <>
                      <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-neutral-200" />
                      <button
                        type="button"
                        aria-label={currentLang === 'ar' ? 'إلغاء التفاعل' : 'Remove reaction'}
                        title={currentLang === 'ar' ? 'إلغاء التفاعل' : 'Remove reaction'}
                        onClick={() => {
                          setReaction(null);
                          setReactionPickerOpen(false);
                        }}
                        className="bayan-reaction-clear grid h-9 w-9 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}
                </div>,
                document.body,
              )}
            </div>
          )}
          <button type="button" onClick={() => { const next = liked === true ? null : true; setLiked(next); if (next) onFeedback?.(message.id, 'like'); }} title={t('goodResponse')} aria-label={t('goodResponse')} aria-pressed={liked === true} className={`cursor-pointer rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${liked === true ? 'bg-neutral-100 text-neutral-900' : ''}`}>
            <ThumbsUp size={14} />
          </button>
          <button type="button" onClick={() => { const next = liked === false ? null : false; setLiked(next); if (next) onFeedback?.(message.id, 'dislike'); }} title={t('badResponse')} aria-label={t('badResponse')} aria-pressed={liked === false} className={`cursor-pointer rounded-md p-1 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${liked === false ? 'bg-neutral-100 text-neutral-900' : ''}`}>
            <ThumbsDown size={14} />
          </button>
        </div>
      )}
      {toast && <div role="status" aria-live="polite" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">{toast}</div>}
      {zoomedImage && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={zoomedImage.name} onClick={() => setZoomedImage(null)}>
          <div className="absolute end-4 top-4 flex items-center gap-2 rounded-2xl border border-white/15 bg-black/40 p-2 text-white shadow-xl backdrop-blur-xl" onClick={(event) => event.stopPropagation()}>
            <a href={zoomedImage.url} download={zoomedImage.name} className="rounded-xl px-3 py-2 text-xs hover:bg-white/10">
              {currentLang === 'ar' ? 'تنزيل بجودتها الأصلية' : 'Download original'}
            </a>
            <button type="button" onClick={() => setZoomedImage(null)} className="rounded-xl px-3 py-2 text-xs hover:bg-white/10">
              {currentLang === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
          <img src={zoomedImage.url} alt={zoomedImage.name} className="max-h-[90vh] max-w-[95vw] rounded-2xl object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  );
}

export const MessageItem = React.memo(MessageItemComponent, (previous, next) => (
  previous.message === next.message
  && previous.userName === next.userName
  && previous.isThinking === next.isThinking
  && previous.readOnly === next.readOnly
  && previous.studyMode === next.studyMode
  && previous.ttsVoice === next.ttsVoice
  && previous.ttsSpeed === next.ttsSpeed
  && previous.preferredLanguage === next.preferredLanguage
  && previous.onRegenerateImage === next.onRegenerateImage
  && previous.onDeleteImage === next.onDeleteImage
  && previous.message.autoExportPdf === next.message.autoExportPdf
  && previous.message.searchActivity === next.message.searchActivity
  && previous.onRegenerate === next.onRegenerate
  && previous.onEditMessage === next.onEditMessage
));
