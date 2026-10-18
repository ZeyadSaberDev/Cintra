import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList, ListChildComponentProps } from 'react-window';
import { MessageItem, type ChatMessageDisplay, type FeedbackRating } from './MessageItem';
import { EmptyState } from './EmptyState';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChevronDown } from 'lucide-react';

interface VirtualMessageData {
  messages: ChatMessageDisplay[];
  userName?: string | null;
  studyMode: boolean;
  highlightUserMessages: boolean;
  highlightAssistantAnswers: boolean;
  userMessageHighlightColor: string;
  assistantAnswerHighlightColor: string;
  ttsVoice: string;
  ttsSpeed: number;
  preferredLanguage: string;
  onRegenerateImage?: () => void;
  onEditImage?: () => void;
  onDeleteImage?: (attachmentId: string) => void;
  onOpenArtifacts?: (messageId: string, artifactId?: string) => void;
  isThinking: boolean;
  isStreaming: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, content: string) => boolean | void | Promise<boolean | void>;
  onFeedback?: (messageId: string, rating: FeedbackRating) => void;
  setRowSize: (index: number, size: number) => void;
}

function estimateMessageHeight(message: ChatMessageDisplay) {
  const charactersPerLine = message.role === 'user' ? 64 : 82;
  const lines = Math.max(1, Math.ceil(message.content.length / charactersPerLine));
  const attachmentHeight = message.attachments?.length ? 100 : 0;
  return Math.max(112, lines * 22 + attachmentHeight + 64);
}

function VirtualMessageRow({ index, style, data }: ListChildComponentProps<VirtualMessageData>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const message = data.messages[index];

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => data.setRowSize(index, Math.ceil(element.getBoundingClientRect().height) + 16);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [data.setRowSize, index]);

  return (
    <div style={{ ...style, overflow: 'visible' }}>
      <div ref={contentRef} className="pb-4">
        <MessageItem
          message={message}
          userName={data.userName}
          isThinking={data.isThinking}
          studyMode={data.studyMode}
          highlightUserMessages={data.highlightUserMessages}
          highlightAssistantAnswers={data.highlightAssistantAnswers}
          userMessageHighlightColor={data.userMessageHighlightColor}
          assistantAnswerHighlightColor={data.assistantAnswerHighlightColor}
          ttsVoice={data.ttsVoice}
          ttsSpeed={data.ttsSpeed}
          preferredLanguage={data.preferredLanguage}
          onRegenerateImage={index === data.messages.length - 1 ? data.onRegenerateImage : undefined}
          onEditImage={index === data.messages.length - 1 ? data.onEditImage : undefined}
          onDeleteImage={data.onDeleteImage}
          onOpenArtifacts={data.onOpenArtifacts}
          onRegenerate={index === data.messages.length - 1 ? data.onRegenerate : undefined}
          onEditMessage={!data.isStreaming ? data.onEditMessage : undefined}
          onFeedback={data.onFeedback}
        />
      </div>
    </div>
  );
}

interface ConversationViewProps {
  messages: ChatMessageDisplay[];
  userName?: string | null;
  isStreaming?: boolean;
  isThinking?: boolean;
  isReconnecting?: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, content: string) => boolean | void | Promise<boolean | void>;
  onSelectPrompt: (promptText: string) => void;
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
  expanded?: boolean;
}

export function ConversationView({
  messages,
  userName,
  isStreaming = false,
  isThinking = false,
  isReconnecting = false,
  onRegenerate,
  onEditMessage,
  onSelectPrompt,
  onFeedback,
  studyMode = false,
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
  expanded = false,
}: ConversationViewProps) {
  const { t, currentLang } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VariableSizeList>(null);
  const rowSizesRef = useRef(new Map<string, number>());
  const messagesRef = useRef(messages);
  const listOuterRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const previousLengthRef = useRef(messages.length);
  const shouldAutoScrollRef = useRef(true);
  const latestContent = messages[messages.length - 1]?.content;
  const isVirtualized = messages.length >= 100;
  messagesRef.current = messages;
  const firstMessageId = messages[0]?.id;

  useEffect(() => {
    rowSizesRef.current.clear();
    listRef.current?.resetAfterIndex(0);
  }, [firstMessageId]);

  useLayoutEffect(() => {
    if (!isVirtualized || !rootRef.current) return;
    const element = rootRef.current;
    const measure = () => setListHeight(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isVirtualized]);

  useEffect(() => {
    if (!messages.length) return;
    const scroller = isVirtualized ? listOuterRef.current : rootRef.current?.parentElement;
    if (!scroller) return;
    const updateScrollPosition = () => {
      const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 80;
      setShowJumpToLatest(distanceFromBottom > 300);
    };
    scroller.addEventListener('scroll', updateScrollPosition, { passive: true });
    return () => scroller.removeEventListener('scroll', updateScrollPosition);
  }, [isVirtualized, messages.length > 0, listHeight]);

  const setRowSize = useCallback((index: number, size: number) => {
    const key = messagesRef.current[index]?.id || String(index);
    if (rowSizesRef.current.get(key) === size) return;
    rowSizesRef.current.set(key, size);
    listRef.current?.resetAfterIndex(index);
  }, []);

  const virtualData = useMemo<VirtualMessageData>(() => ({
    messages,
    userName,
    studyMode,
    highlightUserMessages,
    highlightAssistantAnswers,
    userMessageHighlightColor,
    assistantAnswerHighlightColor,
    ttsVoice,
    ttsSpeed,
    preferredLanguage,
    onRegenerateImage,
    onEditImage,
    onDeleteImage,
    onOpenArtifacts,
    isThinking,
    isStreaming,
    onRegenerate,
    onEditMessage,
    onFeedback,
    setRowSize,
  }), [messages, userName, studyMode, highlightUserMessages, highlightAssistantAnswers, userMessageHighlightColor, assistantAnswerHighlightColor, ttsVoice, ttsSpeed, preferredLanguage, onRegenerateImage, onEditImage, onDeleteImage, onOpenArtifacts, isThinking, isStreaming, onRegenerate, onEditMessage, onFeedback, setRowSize]);

  // Scroll smoothly for a new message and immediately for streamed token updates.
  useEffect(() => {
    const isNewMessage = previousLengthRef.current !== messages.length;
    previousLengthRef.current = messages.length;
    if (!shouldAutoScrollRef.current) {
      return;
    }
    if (isVirtualized) {
      const frame = window.requestAnimationFrame(() => {
        if (isNewMessage && listOuterRef.current) {
          listOuterRef.current.scrollTo({ top: listOuterRef.current.scrollHeight, behavior: 'smooth' });
        } else {
          listRef.current?.scrollToItem(messages.length - 1, 'end');
        }
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => {
      const scroller = rootRef.current?.parentElement;
      scroller?.scrollTo({
        top: scroller.scrollHeight,
        behavior: isNewMessage && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, latestContent, isStreaming, isThinking, isVirtualized]);

  // If no messages yet, show empty state
  if (messages.length === 0) {
    return <EmptyState onSelectPrompt={onSelectPrompt} />;
  }

  const scrollToLatest = () => {
    shouldAutoScrollRef.current = true;
    setShowJumpToLatest(false);
    if (isVirtualized) {
      listOuterRef.current?.scrollTo({
        top: listOuterRef.current.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      return;
    }
    const scroller = rootRef.current?.parentElement;
    scroller?.scrollTo({
      top: scroller.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };

  return (
    <div ref={rootRef} className={`relative mx-auto flex min-h-0 w-full flex-1 flex-col px-4 py-6 pb-10 ${expanded ? 'max-w-6xl' : 'max-w-3xl'}`}>
      {/* Messages Thread */}
      {isVirtualized && listHeight > 0 ? (
        <VariableSizeList
          ref={listRef}
          height={listHeight}
          width="100%"
          itemCount={messages.length}
          itemSize={(index) => rowSizesRef.current.get(messages[index].id) || estimateMessageHeight(messages[index])}
          itemData={virtualData}
          itemKey={(index, data) => data.messages[index].id || index}
          overscanCount={3}
          direction={currentLang === 'ar' ? 'rtl' : 'ltr'}
          outerRef={listOuterRef}
          className="scroll-smooth"
        >
          {VirtualMessageRow}
        </VariableSizeList>
      ) : !isVirtualized ? (
        <div className="space-y-4 flex-1">
          {messages.map((msg, index) => {
            const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
            return (
              <MessageItem
                key={msg.id || index}
                message={msg}
                userName={userName}
                isThinking={isThinking}
                studyMode={studyMode}
                ttsVoice={ttsVoice}
                ttsSpeed={ttsSpeed}
                preferredLanguage={preferredLanguage}
                onRegenerateImage={isLastAssistant ? onRegenerateImage : undefined}
                onEditImage={isLastAssistant ? onEditImage : undefined}
                onDeleteImage={onDeleteImage}
                onRegenerate={isLastAssistant && !isStreaming ? onRegenerate : undefined}
                onEditMessage={!isStreaming ? onEditMessage : undefined}
                onFeedback={onFeedback}
              />
            );
          })}
        </div>
      ) : null}
      {isReconnecting && (
        <div className="flex items-center justify-end gap-2 py-2 text-xs text-neutral-400" role="status">
          <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>{t('reconnecting')}</span>
        </div>
      )}

      {showJumpToLatest && (
        <button
          type="button"
          onClick={scrollToLatest}
          className="bayan-jump-latest absolute bottom-4 left-1/2 z-20 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={currentLang === 'ar' ? 'العودة إلى آخر رسالة' : 'Return to latest message'}
          title={currentLang === 'ar' ? 'العودة إلى آخر رسالة' : 'Return to latest message'}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
