import React, { Suspense, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AuthCard } from './components/auth/AuthCard';
import { Sidebar, SidebarConversation } from './components/layout/Sidebar';
import { WorkspacePage, type WorkspaceSection } from './components/layout/WorkspacePage';
import { Header } from './components/layout/Header';
import { ConversationView } from './components/chat/ConversationView';
import { ChatInput } from './components/chat/ChatInput';
import { SettingsModal } from './components/settings/SettingsModal';
import { GuestBanner } from './components/layout/GuestBanner';
import { AnnouncementBanner } from './components/layout/AnnouncementBanner';
import { InstallAppPrompt } from './components/layout/InstallAppPrompt';
import { SharedConversation } from './components/chat/SharedConversation';
import { HomeTaskDialog, type HomeTaskMode } from './components/chat/HomeTaskDialog';
import { ArtifactPanel } from './components/chat/ArtifactPanel';
import { type ChatMessageDisplay, type FeedbackRating, type MessageAttachment } from './components/chat/MessageItem';
import { Sparkles, RefreshCw, Image as ImageIcon, PenLine, Globe2, Menu, ArrowRight, Sun, Settings as SettingsIcon } from 'lucide-react';
import { shouldUseThinkingMode } from '../lib/chat/complexity';
import imageCompression from 'browser-image-compression';
import { AgentPage } from './components/agent/AgentPage';
import { markHistoryBeforeEdits } from '../lib/chat/messageHistory';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { useBayanAlert } from './contexts/AlertContext';
import { applyThemePreference, readThemePreference, saveThemePreference } from './lib/theme';
import { extractGeneratedArtifacts } from '../lib/artifacts/generatedArtifacts';
import { getEntranceVariants, getMotionTransition, getStaggerChildVariants, getStaggerVariants, motionTiming } from './lib/motion';

const AboutPage = React.lazy(() =>
  import('./components/layout/AboutPage').then((module) => ({ default: module.AboutPage })),
);
const AdminDashboard = React.lazy(() =>
  import('./components/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })),
);

function ActionToast({
  toast,
  onDismiss,
  isRtl,
  language,
}: {
  toast: { tone: 'success' | 'error'; message: string } | null;
  onDismiss: () => void;
  isRtl: boolean;
  language: string;
}) {
  const [mounted, setMounted] = useState(Boolean(toast));
  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    let frame: number | undefined;
    let timer: number | undefined;
    if (toast) {
      setMounted(true);
      frame = window.requestAnimationFrame(() => setVisible(true));
      timer = window.setTimeout(() => {
        setVisible(false);
        dismissTimer.current = window.setTimeout(() => onDismissRef.current(), 200);
      }, 3600);
    } else {
      setVisible(false);
      timer = window.setTimeout(() => setMounted(false), 200);
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, [toast]);

  const dismiss = () => {
    setVisible(false);
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => onDismissRef.current(), 200);
  };

  if (!mounted || !toast) return null;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`bayan-action-toast ${toast.tone === 'error' ? 'is-error' : 'is-success'} ${visible ? 'is-visible' : ''}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <span className="bayan-action-toast-mark" aria-hidden="true">{toast.tone === 'error' ? '!' : '✓'}</span>
      <span className="min-w-0 flex-1">{toast.message}</span>
      <button type="button" aria-label={language === 'ar' ? 'إغلاق' : 'Dismiss'} onClick={dismiss}>×</button>
    </div>
  );
}

function Workspace() {
  const reduceMotion = useReducedMotion();
  const homeEntranceVariants = getEntranceVariants(Boolean(reduceMotion));
  const homeStaggerVariants = getStaggerVariants(Boolean(reduceMotion));
  const homeChildVariants = getStaggerChildVariants(Boolean(reduceMotion));
  const showAlert = useBayanAlert();
  const {
    user, emailVerified, loading, logout, refreshUser, updateProfile,
    sendVerificationEmail, refreshEmailVerification,
  } = useAuth();
  const { t, isRtl, currentLang, setLanguageMode } = useLanguage();

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const savedModel = localStorage.getItem('bayan_selected_model');
    return savedModel || 'cintra-core-v1';
  });
  const [defaultModel, setDefaultModel] = useState<string>('cintra-core-v1');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    return !window.matchMedia('(max-width: 767px)').matches;
  });
  const [thinkingEnabled, setThinkingEnabled] = useState<boolean>(() => (
    localStorage.getItem('bayan_thinking_mode') === 'true'
  ));
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>(() => {
    const storedEffort = localStorage.getItem('bayan_reasoning_effort');
    return storedEffort === 'low' || storedEffort === 'high' ? storedEffort : 'medium';
  });
  const [chatExpanded, setChatExpanded] = useState<boolean>(() => localStorage.getItem('bayan_chat_expanded') === 'true');

  const [conversations, setConversations] = useState<SidebarConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(() => window.location.pathname === '/agent');
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection | null>(() => {
    const match = window.location.pathname.match(/^\/workspace\/(stability|documents|models|design)\/?$/);
    return match ? match[1] as WorkspaceSection : null;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'voice' | 'personalization' | 'plan' | 'data' | 'account'>('general');
  const [imageGeneratorOpen, setImageGeneratorOpen] = useState(false);
  const [imagePromptDraft, setImagePromptDraft] = useState<string | null>(null);
  const [homeTaskMode, setHomeTaskMode] = useState<HomeTaskMode | null>(null);
  const [artifactPanelMessageId, setArtifactPanelMessageId] = useState<string | null>(null);
  const [artifactPanelArtifactId, setArtifactPanelArtifactId] = useState<string | undefined>();
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [artifactMobileView, setArtifactMobileView] = useState<'chat' | 'preview'>('chat');
  const [loadingChat, setLoadingChat] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'success' | 'error' | null>(null);
  const [verificationAction, setVerificationAction] = useState<'send' | 'refresh' | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const mobileViewport = window.matchMedia('(max-width: 767px)');
    const closeSidebarOnMobile = () => {
      if (mobileViewport.matches) setSidebarOpen(false);
    };
    mobileViewport.addEventListener('change', closeSidebarOnMobile);
    return () => mobileViewport.removeEventListener('change', closeSidebarOnMobile);
  }, []);

  const handleSendVerificationEmail = async () => {
    setVerificationAction('send');
    setVerificationMessage(null);
    try {
      await sendVerificationEmail();
      setVerificationMessage(currentLang === 'ar'
        ? 'تم إرسال رسالة التحقق. افحص بريدك الإلكتروني.'
        : 'Verification email sent. Check your inbox.');
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Could not send the verification email.');
    } finally {
      setVerificationAction(null);
    }
  };

  const handleRefreshEmailVerification = async () => {
    setVerificationAction('refresh');
    setVerificationMessage(null);
    try {
      const verified = await refreshEmailVerification();
      setVerificationMessage(verified
        ? (currentLang === 'ar' ? 'تم التحقق من بريدك الإلكتروني.' : 'Your email is verified.')
        : (currentLang === 'ar' ? 'لم يتم رصد التحقق بعد. افتح الرابط ثم أعد المحاولة.' : 'Verification is not detected yet. Open the link and try again.'));
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Could not refresh the verification status.');
    } finally {
      setVerificationAction(null);
    }
  };

  useEffect(() => {
    localStorage.setItem('bayan_chat_expanded', String(chatExpanded));
  }, [chatExpanded]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeSendIdRef = useRef<symbol | null>(null);
  const sendInProgressRef = useRef(false);
  const flushActiveStreamRef = useRef<(() => void) | null>(null);
  const shareId = window.location.pathname.match(/^\/share\/([^/]+)\/?$/)?.[1];

  const speakAssistantResponse = async (text: string) => {
    if (!user?.voiceEnabled || !text.trim()) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const previousAudio = speechAudioRef.current;
    previousAudio?.pause();
    if (previousAudio?.src.startsWith('blob:')) URL.revokeObjectURL(previousAudio.src);
    speechAudioRef.current = null;
    if (text.length <= 5000) {
      try {
        const response = await fetch('/api/tts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            preferredLanguage: user.preferredLanguage || (currentLang === 'ar' ? 'ar-EG' : 'en-US'),
            speed: user.ttsSpeed || 1,
            ...(user.ttsVoice ? { voice: user.ttsVoice } : {}),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message || 'Cloud speech generation failed.');
        if (typeof payload.audioContent !== 'string' || !payload.audioContent) {
          throw new Error('Cloud speech service returned no audio.');
        }
        const bytes = Uint8Array.from(atob(payload.audioContent), (character) => character.charCodeAt(0));
        const audioUrl = URL.createObjectURL(new Blob([bytes], { type: payload.mimeType || 'audio/mpeg' }));
        const audio = new Audio(audioUrl);
        speechAudioRef.current = audio;
        audio.addEventListener('ended', () => URL.revokeObjectURL(audioUrl), { once: true });
        await audio.play();
        return;
      } catch (error) {
        const failedAudio = speechAudioRef.current;
        failedAudio?.pause();
        if (failedAudio?.src.startsWith('blob:')) URL.revokeObjectURL(failedAudio.src);
        speechAudioRef.current = null;
        console.warn('Cloud speech playback failed; using browser speech synthesis.', error);
      }
    }
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = user.preferredLanguage || (currentLang === 'ar' ? 'ar-EG' : 'en-US');
    utterance.rate = user.ttsSpeed || 1;
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.name === user.ttsVoice);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const theme = readThemePreference(user?.theme || 'light');
    const storedAccent = user?.accentColor || localStorage.getItem('bayan_accent_color') || '#6366f1';
    const accentColor = /^#[0-9A-Fa-f]{6}$/.test(storedAccent) ? storedAccent : '#6366f1';
    applyThemePreference(theme);
    document.documentElement.style.setProperty('--bayan-accent', accentColor);
    saveThemePreference(theme);
    localStorage.setItem('bayan_accent_color', accentColor);
  }, [user?.theme, user?.accentColor]);

  useEffect(() => {
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
  }, [currentLang]);

  // Fetch all conversations for the user
  const fetchConversations = async () => {
    if (!user) return;
    setLoadingConversations(true);
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) throw new Error(`Conversation list request failed with status ${res.status}.`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Conversation list request failed:', error);
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    const refreshModels = () => {
      controller?.abort();
      controller = new AbortController();
      fetch('/api/models', { cache: 'no-store', signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('Unable to load available models.');
          return res.json();
        })
        .then((data) => {
          if (disposed || typeof data.defaultModel !== 'string' || !data.defaultModel) return;
          setDefaultModel(data.defaultModel);
          const availableModelIds = new Set<string>(
            Array.isArray(data.models) ? data.models.map((model: { id?: unknown }) => String(model.id || '')) : [],
          );
          setSelectedModel((current) => {
            if (availableModelIds.has(current)) return current;
            localStorage.setItem('bayan_selected_model', data.defaultModel);
            return data.defaultModel;
          });
        })
        .catch((error: unknown) => {
          if (!disposed && !(error instanceof Error && error.name === 'AbortError')) {
            console.error('Model configuration request failed:', error);
          }
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshModels();
    };
    refreshModels();
    window.addEventListener('focus', refreshModels);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener('focus', refreshModels);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  // Load a single conversation's message history
  const loadConversation = async (convId: string) => {
    setArtifactPanelMessageId(null);
    setArtifactPanelOpen(false);
    setArtifactMobileView('chat');
    if (abortControllerRef.current) {
      flushActiveStreamRef.current?.();
      flushActiveStreamRef.current = null;
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      activeSendIdRef.current = null;
      sendInProgressRef.current = false;
      setIsStreaming(false);
      setIsThinking(false);
      setUploadProgress(null);
      setIsReconnecting(false);
    }
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveChatId(convId);
        setMessages(markHistoryBeforeEdits(data.messages || []));
        const model = data.selectedModel || data.conversation?.selectedModel || data.conversation?.model;
        if (model) {
          const conversationModel = typeof model === 'string' && model.trim() ? model : 'cintra-core-v1';
          setSelectedModel(conversationModel);
          localStorage.setItem('bayan_selected_model', conversationModel);
        }
        window.history.pushState({}, '', `/c/${encodeURIComponent(convId)}`);
      } else {
        const data = await res.json().catch(() => ({}));
        const errorMessage = data.error?.message || 'Unable to load this conversation.';
        if (res.status === 403 || res.status === 404) {
          window.history.pushState({}, '', '/');
          setActiveChatId(null);
          setMessages([]);
        }
        showAlert(currentLang === 'ar' ? data.error?.messageAr || 'تعذر فتح هذه المحادثة.' : errorMessage, 'error', currentLang);
      }
    } catch (error) {
      console.error('Conversation load failed:', error);
      showAlert(currentLang === 'ar' ? 'تعذر الاتصال بالخادم لتحميل المحادثة.' : 'Could not connect to load the conversation.', 'error', currentLang);
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    const match = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (match) void loadConversation(decodeURIComponent(match[1]));
  }, [user?.id]);

  useEffect(() => {
    const handlePopState = () => {
      setIsAgentMode(window.location.pathname === '/agent');
      const workspaceMatch = window.location.pathname.match(/^\/workspace\/(stability|documents|models|design)\/?$/);
      setWorkspaceSection(workspaceMatch ? workspaceMatch[1] as WorkspaceSection : null);
      const match = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
      if (match) {
        void loadConversation(decodeURIComponent(match[1]));
      } else {
        setActiveChatId(null);
        setMessages([]);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem('bayan_selected_model', modelId);

    // If inside an active conversation, update it in DB
    if (activeChatId) {
      try {
        const res = await fetch(`/api/conversations/${activeChatId}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedModel: modelId }),
        });
        if (!res.ok) throw new Error('Could not save the selected model.');
      } catch (error) {
        console.error('Model update failed:', error);
        showAlert(currentLang === 'ar' ? 'تعذر حفظ النموذج لهذه المحادثة.' : 'Could not save the model for this conversation.', 'error', currentLang);
      }
    }
  };

  const handleNewChat = () => {
    if (isStreaming && abortControllerRef.current) {
      flushActiveStreamRef.current?.();
      flushActiveStreamRef.current = null;
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      activeSendIdRef.current = null;
      sendInProgressRef.current = false;
      setIsStreaming(false);
      setUploadProgress(null);
      setIsReconnecting(false);
    }
    setIsThinking(false);
    setActiveChatId(null);
    setMessages([]);
    setWorkspaceSection(null);
    setArtifactPanelMessageId(null);
    setArtifactPanelOpen(false);
    setArtifactMobileView('chat');
    window.history.pushState({}, '', '/');
    const preferredModel = localStorage.getItem('bayan_default_model') || defaultModel;
    setSelectedModel(preferredModel);
  };

  const handleToggleSidebar = () => {
    setSidebarOpen((open) => {
      const next = !open;
      localStorage.setItem('sidebarOpen', String(next));
      return next;
    });
  };

  const openWorkspaceSection = (section: WorkspaceSection) => {
    setWorkspaceSection(section);
    setIsAgentMode(false);
    window.history.pushState({}, '', `/workspace/${section}`);
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false);
      localStorage.setItem('sidebarOpen', 'false');
    }
  };

  const returnToChatFromWorkspace = () => {
    setWorkspaceSection(null);
    window.history.pushState({}, '', activeChatId ? `/c/${encodeURIComponent(activeChatId)}` : '/');
  };

  const handleThinkingModeChange = (enabled: boolean) => {
    setThinkingEnabled(enabled);
    localStorage.setItem('bayan_thinking_mode', String(enabled));
  };

  const handleStudyModeChange = async (enabled: boolean) => {
    const saved = await updateProfile({ studyModeEnabled: enabled });
    if (!saved) {
      showAlert(currentLang === 'ar' ? 'تعذر تغيير وضع الدراسة.' : 'Could not update Study Mode.', 'error', currentLang);
    }
  };

  const handleGenerateImage = async (
    prompt: string,
    options: { aspectRatio: '1:1' | '16:9' | '9:16' | '4:3'; style: 'cinematic' | 'anime' | '3d-render' | 'photorealistic' | 'watercolor' } = {
      aspectRatio: '1:1',
      style: 'cinematic',
    },
  ) => {
    if (isGeneratingImage || isStreaming) return;
    const startingConversationId = activeChatId;
    const userMessageId = `image_prompt_${Date.now()}`;
    const assistantMessageId = `image_pending_${Date.now() + 1}`;
    const isArabicPrompt = /[\u0600-\u06FF]/.test(prompt);
    setIsGeneratingImage(true);
    setMessages((previous) => [
      ...previous,
      {
        id: userMessageId,
        role: 'user',
        content: prompt,
        model: selectedModel,
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        model: selectedModel,
        isStreaming: true,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, conversationId: startingConversationId, modelId: selectedModel, ...options }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = currentLang === 'ar'
          ? data.error?.messageAr || data.error?.message
          : data.error?.message;
        throw new Error(message || (isArabicPrompt ? 'تعذر إنشاء الصورة.' : 'Could not generate the image.'));
      }

      if (activeChatId !== startingConversationId) {
        void fetchConversations();
        return;
      }
      setActiveChatId(data.conversationId);
      if (data.isNewConversation) window.history.pushState({}, '', `/c/${encodeURIComponent(data.conversationId)}`);
      setMessages((previous) => [
        ...previous.filter((message) => message.id !== userMessageId && message.id !== assistantMessageId),
        data.userMessage,
        { ...data.message, isStreaming: false, imageGenerationComplete: true },
      ]);
      void fetchConversations();
    } catch (error) {
      if (activeChatId === startingConversationId) {
        setMessages((previous) => previous.filter((message) => message.id !== userMessageId && message.id !== assistantMessageId));
      }
      throw error;
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleRegenerateImage = () => {
    const lastImagePrompt = [...messages].reverse().find((message) => (
      message.role === 'user' && /^(?:Generate image|إنشاء صورة):\s*/i.test(message.content)
    ));
    if (!lastImagePrompt) {
      showAlert(currentLang === 'ar' ? 'تعذر العثور على وصف الصورة الأصلية.' : 'The original image prompt could not be found.', 'error', currentLang);
      return;
    }
    const prompt = lastImagePrompt.content.replace(/^(?:Generate image|إنشاء صورة):\s*/i, '').trim();
    void handleGenerateImage(prompt).catch((error: unknown) => {
      showAlert(error instanceof Error ? error.message : (currentLang === 'ar' ? 'تعذر إنشاء الصورة.' : 'Could not generate the image.'), 'error', currentLang);
    });
  };

  const handleEditImagePrompt = () => {
    const lastImagePrompt = [...messages].reverse().find((message) => (
      message.role === 'user' && /^(?:Generate image|إنشاء صورة):\s*/i.test(message.content)
    ));
    if (!lastImagePrompt) {
      showAlert(currentLang === 'ar' ? 'تعذر العثور على وصف الصورة الأصلية.' : 'The original image prompt could not be found.', 'error', currentLang);
      return;
    }
    setImagePromptDraft(lastImagePrompt.content.replace(/^(?:Generate image|إنشاء صورة):\s*/i, '').trim());
    setImageGeneratorOpen(true);
  };

  const handleDeleteImage = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/images/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || 'Could not delete this image.');
      setMessages((current) => current.map((message) => ({
        ...message,
        attachments: message.attachments?.filter((attachment) => attachment.id !== attachmentId),
      })));
      setActionToast({
        tone: 'success',
        message: currentLang === 'ar' ? 'تم حذف الصورة بنجاح.' : 'Image deleted successfully.',
      });
    } catch (error) {
      setActionToast({
        tone: 'error',
        message: error instanceof Error ? error.message : (currentLang === 'ar' ? 'تعذر حذف الصورة.' : 'Could not delete the image.'),
      });
    }
  };

  // Streaming send message handler
  const handleSendMessage = async (
    text: string,
    files: File[] = [],
    regenerate = false,
    editMessageId?: string,
    modelOverride?: string,
    webSearchConsent = false,
  ) => {
    if ((!text.trim() && !files.length) || isStreaming || sendInProgressRef.current) return;
    const requestModel = modelOverride || selectedModel;
    const explicitVisualRequest = /(?:\b(?:generate|create|draw|make|paint|illustrate)\s+(?:an?\s+)?(?:image|picture|illustration|art)\b|\b(?:صمم|ارسم|أنشئ|انشئ)\s+(?:صورة|رسمة)\b)/i.test(text);
    const visualVerbRequest = /^\s*(?:please\s+)?(?:generate|create|draw|paint|illustrate)\s+(?:me\s+)?/i.test(text)
      && !/\b(?:text|report|summary|code|script|sql|json|email|story|plan|list|table|explanation)\b/i.test(text);
    const imageRequest = !regenerate && !editMessageId && !files.length && (explicitVisualRequest || visualVerbRequest);
    if (imageRequest) {
      const prompt = text
        .replace(/^\s*(?:please\s+)?(?:generate|create|draw|make|paint|illustrate)\s+(?:me\s+)?(?:(?:an?|the)\s+)?(?:(?:image|picture|illustration|art)\s*(?:of|showing|with)?\s*)?/i, '')
        .replace(/^(?:من فضلك\s*)?(?:صمم|ارسم|أنشئ|انشئ)\s+(?:لي\s*)?(?:صورة|رسمة)\s*(?:عن|لـ|ل)?\s*/i, '')
        .trim();
      if (prompt.length >= 3) {
        try {
          await handleGenerateImage(prompt);
        } catch (error) {
          showAlert(error instanceof Error ? error.message : (currentLang === 'ar' ? 'تعذر إنشاء الصورة.' : 'Could not generate the image.'), 'error', currentLang);
        }
        return;
      }
    }
    const editedMessage = editMessageId
      ? messages.find((item) => item.id === editMessageId && item.role === 'user')
      : undefined;
    if (editMessageId && !editedMessage) return;
    const messageText = text.trim() || (currentLang === 'ar' ? 'يرجى مراجعة الملف المرفق.' : 'Please review the attached file(s).');
    const asksForPdf = /\bpdf\b|بي\s*دي\s*اف/i.test(messageText)
      && /(?:\b(?:make|create|generate|give|send|export|download|save|provide|need|want|turn|convert|prepare|attach)\b|(?:ملف|نسخة|صيغة)\s*(?:بصيغة\s*)?(?:pdf|بي\s*دي\s*اف)|(?:in|as|into|to)\s+(?:a\s+)?pdf\b|(?:عايز|عاوز|اريد|أريد|اعطني|أعطني|اديني|هات|اعملي|اعمله|خليه|خليها|جهز|جهّز|حوّل|حول|أنشئ|انشئ|نزّل|نزل|صدّر|صدر|بصيغة))/i.test(messageText);
    const requestsPdf = !regenerate && asksForPdf;

    const userMessageId = editMessageId || `user_${Date.now()}`;
    const assistantMessageId = `asst_${Date.now() + 1}`;
    const localAttachments: MessageAttachment[] = files.map((file, index) => ({
      id: `${userMessageId}_pending_${index}`,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      previewUrl: URL.createObjectURL(file),
      uploadState: 'uploading',
    }));

    const newUserMsg: ChatMessageDisplay = {
      id: userMessageId,
      role: 'user',
      content: messageText,
      model: requestModel,
      createdAt: new Date().toISOString(),
      ...(localAttachments.length ? { attachments: localAttachments } : {}),
    };

    const initialAsstMsg: ChatMessageDisplay = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      model: requestModel,
      isStreaming: true,
      createdAt: new Date().toISOString(),
    };
    const sendId = Symbol('chat-send');
    activeSendIdRef.current = sendId;
    sendInProgressRef.current = true;
    const useThinking = thinkingEnabled && shouldUseThinkingMode(messageText);
    setIsThinking(useThinking);

    // Optimistic UI updates
    setMessages((prev) => {
      if (editMessageId) {
        const editIndex = prev.findIndex((item) => item.id === editMessageId);
        if (editIndex < 0) return prev;
        const editedAt = new Date().toISOString();
        return [
          ...prev.map((item, index) => index === editIndex
            ? { ...item, content: messageText, model: requestModel, editedAt, isPriorHistory: false }
            : index > editIndex ? { ...item, isPriorHistory: true } : item),
          initialAsstMsg,
        ];
      }
      return regenerate ? [...prev, initialAsstMsg] : [...prev, newUserMsg, initialAsstMsg];
    });
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let bufferedResponse = '';
    let streamFrame: number | null = null;
    let streamedAssistantContent = '';
    let artifactPanelAutoOpened = false;
    const flushStreamBuffer = () => {
      if (streamFrame !== null) {
        window.cancelAnimationFrame(streamFrame);
        streamFrame = null;
      }
      if (!bufferedResponse) return;
      const content = bufferedResponse;
      bufferedResponse = '';
      streamedAssistantContent += content;
      if (!artifactPanelAutoOpened && extractGeneratedArtifacts(streamedAssistantContent).length > 0) {
        artifactPanelAutoOpened = true;
        setArtifactPanelMessageId(assistantMessageId);
        setArtifactPanelOpen(true);
        setArtifactMobileView('preview');
      }
      setMessages((prev) => prev.map((item) => item.id === assistantMessageId
        ? { ...item, content: item.content + content }
        : item));
    };
    flushActiveStreamRef.current = flushStreamBuffer;

    let requestStage: 'upload' | 'chat' | 'stream' = 'chat';
    try {
      let uploadedFiles: Array<{ id: string; name: string; mimeType: string; size: number }> = [];
      if (files.length) {
        requestStage = 'upload';
        setUploadStatus('uploading');
        setUploadProgress(null);
        const uploadableFiles = await Promise.all(files.map(async (file) => {
          if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
          const compressed = await imageCompression(file, {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 2048,
            useWebWorker: true,
            fileType: file.type,
          });
          return new File([compressed], file.name, { type: compressed.type || file.type });
        }));
        const formData = new FormData();
        uploadableFiles.forEach((file) => formData.append('files', file));
        uploadedFiles = await new Promise<Array<{ id: string; name: string; mimeType: string; size: number }>>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload');
          xhr.withCredentials = true;
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(progress);
              setMessages((prev) => prev.map((item) => item.id === userMessageId
                ? {
                    ...item,
                    attachments: item.attachments?.map((attachment) => ({
                      ...attachment,
                      uploadProgress: progress,
                    })),
                  }
                : item));
            }
          };
          xhr.onload = () => {
            let result: any = {};
            try { result = JSON.parse(xhr.responseText); } catch {
              reject(new Error('Upload returned an invalid response.'));
              return;
            }
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error(result.error?.message || 'File upload failed.'));
              return;
            }
            resolve(result.files || []);
          };
          xhr.onerror = () => reject(new Error('File upload connection failed.'));
          xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
          controller.signal.addEventListener('abort', () => xhr.abort(), { once: true });
          xhr.send(formData);
        });
        setMessages((prev) => prev.map((item) => item.id === userMessageId
          ? {
              ...item,
              attachments: uploadedFiles.map((file, index) => ({
                ...localAttachments[index],
                id: file.id,
                fileName: file.name,
                fileType: file.mimeType,
                fileSize: file.size,
                uploadState: 'complete',
                uploadProgress: 100,
              })),
            }
          : item));
        setUploadStatus('success');
        window.setTimeout(() => setUploadStatus(null), 1800);
        setUploadProgress(null);
      }

      requestStage = 'chat';
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          conversationId: activeChatId,
          message: messageText,
          modelId: requestModel,
          regenerate,
          editMessageId,
          thinkingModeEnabled: thinkingEnabled,
          reasoningEffort,
          webSearchConsent,
          attachmentIds: uploadedFiles.map((file) => file.id),
        }),
        signal: controller.signal,
      });

      if (activeSendIdRef.current !== sendId) return;
      if (!res.ok) {
        let errData: any = {};
        try {
          errData = await res.json();
        } catch (error) {
          console.error('Could not parse chat error response:', error);
        }
        if (activeSendIdRef.current !== sendId) return;
        const errorText =
          currentLang === 'ar'
            ? errData.error?.messageAr || errData.error?.message || 'تعذر معالجة الطلب.'
            : errData.error?.message || 'Failed to process request.';

        if (editMessageId) {
          setMessages((prev) => [
            ...prev.filter((item) => item.id !== assistantMessageId),
            { ...initialAsstMsg, content: `⚠️ ${errorText}`, isStreaming: false },
          ]);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: `⚠️ ${errorText}`, isStreaming: false }
                : m
            )
          );
        }
        setIsStreaming(false);
        return;
      }

      if (!res.body) {
        setMessages((prev) => prev.map((message) => message.id === assistantMessageId
          ? {
              ...message,
              content: currentLang === 'ar' ? 'تعذر بدء تدفق الرد من الخادم.' : 'The response stream was unavailable.',
              isStreaming: false,
            }
          : message));
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      requestStage = 'stream';
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let searchActivity: ChatMessageDisplay['searchActivity'];

      while (true) {
        const { done, value } = await reader.read();
        if (activeSendIdRef.current !== sendId) break;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (activeSendIdRef.current !== sendId) break;
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6).trim();

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'init') {
              const persistedUserMessageId = typeof data.userMessage?.id === 'string'
                ? data.userMessage.id
                : null;
              if (persistedUserMessageId || uploadedFiles.length) {
                setMessages((prev) => prev.map((item) => {
                  if (item.id !== userMessageId) return item;
                  return {
                    ...item,
                    ...(persistedUserMessageId ? { id: persistedUserMessageId } : {}),
                    ...(uploadedFiles.length ? {
                      attachments: uploadedFiles.map((file) => ({
                        id: file.id,
                        fileName: file.name,
                        fileType: file.mimeType,
                        fileSize: file.size,
                        uploadState: 'complete' as const,
                        uploadProgress: 100,
                      })),
                    } : {}),
                  };
                }));
              }
              if (data.conversationId) {
                setActiveChatId(data.conversationId);
                window.history.pushState({}, '', `/c/${encodeURIComponent(data.conversationId)}`);
              }
              if (data.isNewConversation) {
                void fetchConversations();
              }
            } else if (data.type === 'status') {
              setIsThinking(false);
              if (['searching_web', 'search_results', 'search_empty', 'search_failed'].includes(data.status)) {
                const status = data.status === 'searching_web'
                  ? 'searching'
                  : data.status === 'search_results'
                    ? 'results'
                    : data.status === 'search_empty'
                      ? 'empty'
                      : 'failed';
                const sources = Array.isArray(data.sources)
                  ? data.sources.filter((source: unknown): source is { title: string; url: string } => (
                    typeof source === 'object'
                    && source !== null
                    && typeof (source as { title?: unknown }).title === 'string'
                    && typeof (source as { url?: unknown }).url === 'string'
                  ))
                  : [];
                searchActivity = { status, sources };
                setMessages((prev) => prev.map((item) => item.id === assistantMessageId
                  ? { ...item, searchActivity }
                  : item));
              }
            } else if (data.type === 'token') {
              setIsThinking(false);
              bufferedResponse += data.content;
              if (streamFrame === null) {
                streamFrame = window.requestAnimationFrame(flushStreamBuffer);
              }
            } else if (data.type === 'done') {
              flushStreamBuffer();
              const finalContent = typeof data.message?.content === 'string' ? data.message.content : streamedAssistantContent;
              if (!artifactPanelAutoOpened && extractGeneratedArtifacts(finalContent).length > 0) {
                artifactPanelAutoOpened = true;
                setArtifactPanelMessageId(assistantMessageId);
                setArtifactPanelOpen(true);
                setArtifactMobileView('preview');
              }
              speakAssistantResponse(data.message?.content || bufferedResponse);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: data.message?.content || m.content,
                        id: data.messageId || m.id,
                        isStreaming: false,
                        autoExportPdf: requestsPdf,
                        ...(searchActivity ? { searchActivity } : {}),
                      }
                    : m
                )
              );
              setIsStreaming(false);
              refreshUser();
              void fetchConversations();
            } else if (data.type === 'error') {
              flushStreamBuffer();
              const errObj = data.error;
              const errNotice =
                currentLang === 'ar'
                  ? errObj?.messageAr || errObj?.message || 'خدمة الذكاء الاصطناعي غير متاحة حاليًا.'
                  : errObj?.message || 'The AI service is unavailable right now.';

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: `${m.content}\n\n⚠️ ${errNotice}`, isStreaming: false }
                    : m
                )
              );
              setIsStreaming(false);
            }
          } catch (error) {
            console.error('Could not parse chat stream event:', error);
          }
        }
      }
    } catch (err: any) {
      if (activeSendIdRef.current !== sendId) return;
      flushStreamBuffer();
      if (err.name !== 'AbortError') {
        if (requestStage !== 'upload') {
          setIsReconnecting(true);
          await new Promise((resolve) => window.setTimeout(resolve, 700));
          setIsReconnecting(false);
        }
        const failureMessage = requestStage === 'upload'
          ? currentLang === 'ar'
            ? 'تعذر رفع الملف، حاول مرة أخرى.'
            : 'The file could not be uploaded. Please try again.'
          : currentLang === 'ar'
            ? 'تعذر إكمال الطلب حاليًا. يرجى المحاولة مرة أخرى لاحقًا.'
            : 'The request could not be completed. Please try again later.';
        if (requestStage === 'upload') {
          setUploadStatus('error');
          setMessages((prev) => prev.map((item) => item.id === userMessageId
            ? {
                ...item,
                attachments: item.attachments?.map((attachment) => ({
                  ...attachment,
                  uploadState: 'failed',
                })),
              }
            : item));
          window.setTimeout(() => setUploadStatus(null), 4000);
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: `${m.content}\n\n⚠️ ${failureMessage}`,
                  isStreaming: false,
                }
              : m
          )
        );
      }
    } finally {
      if (activeSendIdRef.current === sendId) {
        setUploadProgress(null);
        setIsStreaming(false);
        setIsThinking(false);
        setIsReconnecting(false);
        abortControllerRef.current = null;
        activeSendIdRef.current = null;
        sendInProgressRef.current = false;
        flushActiveStreamRef.current = null;
      }
    }
  };

  const handleStopGeneration = () => {
    flushActiveStreamRef.current?.();
    flushActiveStreamRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeSendIdRef.current = null;
    sendInProgressRef.current = false;
    setIsStreaming(false);
    setIsThinking(false);
    setUploadProgress(null);
    setIsReconnecting(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false, cancelled: true } : m))
    );
  };

  const handleRegenerate = () => {
    const userMsgs = messages.filter((m) => m.role === 'user');
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    if (lastUserMsg) {
      setMessages((prev) => prev.slice(0, prev.length - 1));
      void handleSendMessage(lastUserMsg.content, [], true);
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    if (!activeChatId || isStreaming || sendInProgressRef.current) return false;
    await handleSendMessage(content, [], false, messageId);
    return true;
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTitle }),
      });
      if (!res.ok) throw new Error('Could not rename conversation.');
      await fetchConversations();
    } catch (error) {
      console.error('Conversation rename failed:', error);
      showAlert(currentLang === 'ar' ? 'تعذر تغيير اسم المحادثة.' : 'Could not rename the conversation.', 'error', currentLang);
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}/pin`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Could not update conversation pin.');
      await fetchConversations();
    } catch (error) {
      console.error('Conversation pin update failed:', error);
      showAlert(currentLang === 'ar' ? 'تعذر تحديث تثبيت المحادثة.' : 'Could not update the conversation pin.', 'error', currentLang);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Could not delete conversation.');

      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
        window.history.pushState({}, '', '/');
      }
      await fetchConversations();
    } catch (error) {
      console.error('Conversation deletion failed:', error);
      setActionToast({
        tone: 'error',
        message: currentLang === 'ar' ? 'تعذر حذف المحادثة.' : 'Could not delete the conversation.',
      });
    }
  };

  const handleShareChat = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}/share`, {
        method: 'GET',
      });
      if (res.ok) {
        const data = await res.json();
        const fullShareUrl = `${window.location.origin}${data.shareUrl}`;
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(fullShareUrl);
          showAlert(
            isRtl
              ? `تم نسخ رابط المشاركة إلى الحافظة:\n${fullShareUrl}`
              : `Share link copied to clipboard:\n${fullShareUrl}`,
            'info',
            currentLang,
          );
        }
      } else {
        throw new Error('Could not create a share link.');
      }
    } catch (error) {
      console.error('Conversation sharing failed:', error);
      showAlert(currentLang === 'ar' ? 'تعذر إنشاء رابط المشاركة.' : 'Could not create a share link.', 'error', currentLang);
    }
  };

  const handleFeedback = async (messageId: string, rating: FeedbackRating) => {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, rating }),
      });
      if (!response.ok) throw new Error('Could not save message feedback.');
    } catch (error) {
      console.error('Message feedback request failed:', error);
    }
  };

  if (window.location.pathname === '/about') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#fafafa]" role="status" />}>
        <AboutPage />
      </Suspense>
    );
  }

  if (shareId) {
    return <SharedConversation shareId={decodeURIComponent(shareId)} />;
  }

  if (loading) {
    return (
      <div className="bayan-entry-screen w-screen h-screen flex flex-col items-center justify-center">
        <div className="bayan-entry-brand" role="status" aria-label="Loading Cintra">
          <div className="bayan-entry-mark">
            <img src="/cintra-mark.png" alt="" aria-hidden="true" />
            <span />
          </div>
          <div className="bayan-entry-wordmark">Cintra</div>
        </div>
        <div className="bayan-entry-progress" aria-hidden="true"><span /></div>
      </div>
    );
  }

  // Not authenticated: render the Auth Card
  if (!user) {
    return <AuthCard onSuccess={(verificationEmailSent) => {
      if (verificationEmailSent === false) {
        setVerificationMessage(currentLang === 'ar'
          ? 'تم إنشاء الحساب، لكن تعذّر إرسال رسالة التحقق. استخدم زر إعادة الإرسال أدناه.'
          : 'Account created, but the verification email could not be sent. Use the resend button below.');
      }
    }} />;
  }

  if (!user.isGuest && emailVerified === false) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-5 py-10 text-neutral-900">
        <section className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-xl font-semibold">
            {currentLang === 'ar' ? 'أكّد بريدك الإلكتروني للمتابعة' : 'Verify your email to continue'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            {currentLang === 'ar'
              ? 'أرسلنا رابط التحقق إلى بريدك. افتح الرابط ثم حدّث حالة التحقق للمتابعة إلى Cintra.'
              : 'Open the verification link sent to your email, then refresh your verification status to continue to Cintra.'}
          </p>
          {verificationMessage && <p className="mt-4 text-sm" role="status">{verificationMessage}</p>}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void handleSendVerificationEmail()}
              disabled={verificationAction !== null}
              className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {verificationAction === 'send'
                ? (currentLang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...')
                : (currentLang === 'ar' ? 'إعادة إرسال رسالة التحقق' : 'Resend verification email')}
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshEmailVerification()}
              disabled={verificationAction !== null}
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {verificationAction === 'refresh'
                ? (currentLang === 'ar' ? 'جارٍ التحديث...' : 'Refreshing...')
                : (currentLang === 'ar' ? 'تحققت، حدّث الحالة' : "I've verified, refresh status")}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-950"
            >
              {currentLang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (isAgentMode) {
    return <AgentPage onBack={() => {
      window.history.pushState({}, '', '/');
      setIsAgentMode(false);
    }} />;
  }

  const isHomeScreen = !activeChatId && messages.length === 0 && !loadingChat;
  const handleHomeTaskSubmit = (request: string, webSearchConsent = false) => {
    const modelOverride = homeTaskMode === 'search' ? 'cintra-research' : selectedModel;
    if (homeTaskMode === 'search') {
      setSelectedModel(modelOverride);
      localStorage.setItem('bayan_selected_model', modelOverride);
    }
    setHomeTaskMode(null);
    void handleSendMessage(request, [], false, undefined, modelOverride, webSearchConsent);
  };
  const handleOpenArtifacts = (messageId: string, artifactId?: string) => {
    setArtifactPanelMessageId(messageId);
    setArtifactPanelArtifactId(artifactId);
    setArtifactPanelOpen(true);
    setArtifactMobileView('preview');
  };
  const artifactMessage = messages.find((message) => message.id === artifactPanelMessageId);
  const activeArtifacts = artifactMessage ? extractGeneratedArtifacts(artifactMessage.content) : [];
  const openImageStudio = () => {
    void handleSelectModel('cintra-creative');
    setImagePromptDraft(currentLang === 'ar' ? 'صمم لي صورة لـ ' : 'Create an image of ');
    setImageGeneratorOpen(true);
  };
  const openWritingWorkspace = () => {
    void handleSelectModel('cintra-core-v1');
    setHomeTaskMode('write');
  };
  const openWebResearch = () => {
    void handleSelectModel('cintra-research');
    setHomeTaskMode('search');
  };
  const chatInput = (
    <ChatInput
      selectedModel={selectedModel}
      onSelectModel={handleSelectModel}
      reasoningEffort={reasoningEffort}
      onReasoningEffortChange={(effort) => {
        setReasoningEffort(effort);
        localStorage.setItem('bayan_reasoning_effort', effort);
      }}
      onSendMessage={(message, files, webSearchConsent) => {
        void handleSendMessage(message, files, false, undefined, undefined, webSearchConsent);
      }}
      expanded={chatExpanded}
      isGenerating={isStreaming}
      onStopGeneration={handleStopGeneration}
      uploadProgress={uploadProgress}
      uploadStatus={uploadStatus}
      studyMode={user?.studyModeEnabled ?? false}
      onToggleStudyMode={() => void handleStudyModeChange(!(user?.studyModeEnabled ?? false))}
      thinkingEnabled={thinkingEnabled}
      onToggleThinking={() => handleThinkingModeChange(!thinkingEnabled)}
      onGenerateImage={handleGenerateImage}
      imageGenerationBusy={isGeneratingImage}
      homeMode={isHomeScreen}
      openImageGenerator={imageGeneratorOpen}
      imagePromptDraft={imagePromptDraft}
      onImagePromptDraftConsumed={() => setImagePromptDraft(null)}
      onImageGeneratorOpenChange={setImageGeneratorOpen}
      webSearchEnabled={selectedModel === 'cintra-research'}
    />
  );

  // Authenticated: render the complete ChatGPT-style workspace
  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`bayan-workspace flex w-screen h-screen overflow-hidden bg-white text-neutral-900 font-sans ${isRtl ? 'rtl' : 'ltr'} ${isHomeScreen ? 'bayan-home-layout' : ''}`}>
      <motion.button
        type="button"
        aria-label={t('closeSidebar')}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        onClick={handleToggleSidebar}
        initial={false}
        animate={{ opacity: sidebarOpen ? 1 : 0, visibility: sidebarOpen ? 'visible' : 'hidden' }}
        transition={getMotionTransition(Boolean(reduceMotion), motionTiming.panel)}
        style={{ pointerEvents: sidebarOpen ? 'auto' : 'none' }}
        className="fixed inset-0 z-30 bg-black/20 md:hidden"
      />
      <div
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        className={`fixed inset-y-0 ltr:left-0 rtl:right-0 z-40 w-[clamp(240px,_18vw,_290px)] transition-[transform,width] duration-200 md:relative md:inset-auto md:translate-x-0 md:shrink-0 ${
        sidebarOpen
          ? 'translate-x-0 md:w-[clamp(240px,_18vw,_290px)]'
          : `${isRtl ? 'translate-x-full' : '-translate-x-full'} md:w-0 md:overflow-hidden`
      }`}>
        <Sidebar
          conversations={conversations}
          isLoading={loadingConversations}
          activeChatId={activeChatId}
          onNewChat={() => {
            handleNewChat();
            if (window.matchMedia('(max-width: 767px)').matches) handleToggleSidebar();
          }}
          onSelectChat={(id) => {
            setWorkspaceSection(null);
            void loadConversation(id);
            if (window.matchMedia('(max-width: 767px)').matches) handleToggleSidebar();
          }}
          onRenameChat={handleRenameChat}
          onTogglePin={handleTogglePin}
          onDeleteChat={handleDeleteChat}
          onShareChat={handleShareChat}
          onOpenSettings={() => {
            setSettingsInitialTab('general');
            setIsSettingsOpen(true);
          }}
          onOpenPlans={() => {
            setSettingsInitialTab('plan');
            setIsSettingsOpen(true);
          }}
          onOpenImages={() => {
            if (!isHomeScreen) handleNewChat();
            setImageGeneratorOpen(true);
          }}
          onOpenAgent={() => {
            window.history.pushState({}, '', '/agent');
            setWorkspaceSection(null);
            setIsAgentMode(true);
          }}
          activeWorkspaceSection={workspaceSection}
          onOpenWorkspaceSection={openWorkspaceSection}
        />
      </div>

      {/* Main Content Viewport */}
      <div className={`bayan-main-viewport flex-1 flex flex-col min-w-0 h-screen overflow-hidden ${isHomeScreen ? 'bayan-home-viewport' : 'bg-white'}`}>
        {user && !user.isGuest && emailVerified === false && (
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span>{currentLang === 'ar' ? 'لم يتم التحقق من بريدك الإلكتروني.' : 'Your email address is not verified.'}</span>
            <button
              type="button"
              onClick={() => void handleSendVerificationEmail()}
              disabled={verificationAction !== null}
              className="rounded-lg bg-amber-900 px-3 py-1.5 font-medium text-white disabled:opacity-60"
            >
              {verificationAction === 'send'
                ? (currentLang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...')
                : (currentLang === 'ar' ? 'إرسال رسالة التحقق' : 'Send verification email')}
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshEmailVerification()}
              disabled={verificationAction !== null}
              className="rounded-lg border border-amber-700 px-3 py-1.5 font-medium disabled:opacity-60"
            >
              {verificationAction === 'refresh'
                ? (currentLang === 'ar' ? 'جارٍ التحديث...' : 'Refreshing...')
                : (currentLang === 'ar' ? 'تحققت، حدّث الحالة' : "I've verified, refresh status")}
            </button>
            {verificationMessage && <span role="status" className="basis-full text-center">{verificationMessage}</span>}
          </div>
        )}
        {/* Guest Banner */}
        {user?.isGuest && !isHomeScreen && (
          <GuestBanner onSignUp={() => logout()} />
        )}
        <AnnouncementBanner />
        <InstallAppPrompt />

        {/* Top Header */}
        {isHomeScreen ? (
          <header className="bayan-home-header relative z-30 flex h-16 shrink-0 items-center justify-center px-5 sm:px-8">
            <div className="bayan-home-header-start absolute flex items-center gap-2">
              <button type="button" onClick={handleToggleSidebar} aria-label={t('toggleSidebar')} title={t('toggleSidebar')} className="bayan-home-header-icon">
                <Menu size={19} />
              </button>
              <button type="button" onClick={() => void fetchConversations()} aria-label={currentLang === 'ar' ? 'تحديث المحادثات' : 'Refresh conversations'} title={currentLang === 'ar' ? 'تحديث' : 'Refresh'} className="bayan-home-header-icon">
                <RefreshCw size={17} />
              </button>
              <button type="button" onClick={() => { setSettingsInitialTab('plan'); setIsSettingsOpen(true); }} className="bayan-home-plan-chip">
                <Sparkles size={15} />{currentLang === 'ar' ? 'الخطط' : 'Plans'}
              </button>
            </div>
            <div className="bayan-home-header-end absolute flex items-center gap-2">
              <div className="bayan-home-language flex items-center gap-2 rounded-full px-3 py-2" dir="ltr">
                <button type="button" onClick={() => setLanguageMode(currentLang === 'ar' ? 'en' : 'ar')} className="min-w-6 text-xs font-semibold">
                  {currentLang === 'ar' ? 'ع' : 'EN'}
                </button>
                <span aria-hidden="true" className="bayan-home-language-divider">|</span>
                <button type="button" onClick={() => setLanguageMode(currentLang === 'ar' ? 'en' : 'ar')} aria-label={currentLang === 'ar' ? 'Change language to English' : 'تغيير اللغة إلى العربية'} title={currentLang === 'ar' ? 'English' : 'العربية'}>
                  <Globe2 size={17} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setSettingsInitialTab('general'); setIsSettingsOpen(true); }}
                aria-label={currentLang === 'ar' ? 'الإعدادات' : 'Settings'}
                title={currentLang === 'ar' ? 'الإعدادات' : 'Settings'}
                className="bayan-home-header-icon bayan-header-floating-action"
              >
                <SettingsIcon size={17} />
              </button>
              <button type="button" onClick={handleNewChat} className="bayan-home-chat-mode">
                <Sun size={16} />{currentLang === 'ar' ? 'محادثة' : 'Chat'}
              </button>
            </div>
          </header>
        ) : (
          <Header
            onShare={() => (activeChatId ? handleShareChat(activeChatId) : undefined)}
            onToggleSidebar={handleToggleSidebar}
            isChatExpanded={chatExpanded}
            onToggleChatWidth={() => setChatExpanded((expanded) => !expanded)}
            onOpenSettings={() => { setSettingsInitialTab('general'); setIsSettingsOpen(true); }}
            studyMode={user?.studyModeEnabled ?? false}
          />
        )}
        {user?.studyModeEnabled && !isHomeScreen && (
          <section className="bayan-study-banner mx-4 mt-3 rounded-2xl border px-4 py-3 text-start" role="status">
            <h2 className="text-sm font-semibold">{t('studyWorkspaceTitle')}</h2>
            <p className="mt-1 text-xs leading-5">{t('studyWorkspaceDescription')}</p>
          </section>
        )}

        <main dir="ltr" className={`bayan-conversation-main flex flex-1 min-h-0 flex-col gap-2 overflow-hidden p-2 sm:gap-3 ${isHomeScreen ? 'bayan-home-main' : 'bg-white'}`}>
          {workspaceSection ? (
            <WorkspacePage
              section={workspaceSection}
              selectedModel={selectedModel}
              onSelectModel={(modelId) => void handleSelectModel(modelId)}
              onBackToChat={returnToChatFromWorkspace}
              onOpenSettings={() => {
                setSettingsInitialTab('general');
                setIsSettingsOpen(true);
              }}
              onStartChat={handleNewChat}
            />
          ) : (
          <>
          {artifactPanelOpen && activeArtifacts.length > 0 && !isHomeScreen && (
            <nav className="bayan-artifact-mobile-tabs shrink-0" aria-label={currentLang === 'ar' ? 'عرض مساحة العمل' : 'Workspace view'}>
              <button type="button" onClick={() => setArtifactMobileView('chat')} className={artifactMobileView === 'chat' ? 'is-active' : ''}>
                {currentLang === 'ar' ? 'المحادثة' : 'Chat'}
              </button>
              <button type="button" onClick={() => setArtifactMobileView('preview')} className={artifactMobileView === 'preview' ? 'is-active' : ''}>
                {currentLang === 'ar' ? 'المحرر والمعاينة' : 'Editor & preview'}
              </button>
            </nav>
          )}
          <motion.div
            layout
            transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 200, damping: 25 }}
            className="bayan-workspace-panes flex min-h-0 min-w-0 flex-1 flex-row gap-3"
          >
          <motion.div
            layout
            transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 200, damping: 25 }}
            dir={isRtl ? 'rtl' : 'ltr'}
            className={`bayan-chat-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[flex-basis] duration-300 ${artifactPanelOpen && artifactMobileView === 'preview' ? 'is-mobile-hidden' : ''}`}
          >
          {isHomeScreen ? (
            <motion.section
              initial="hidden"
              animate="visible"
              variants={homeEntranceVariants}
              className="bayan-home-screen flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 sm:px-8 sm:py-10"
            >
              <motion.div variants={homeStaggerVariants} className="bayan-home-content w-full max-w-[896px]">
                <motion.div variants={homeChildVariants} className="bayan-home-heading-wrap relative mx-auto mb-7 w-fit max-w-full">
                  <Sparkles className="bayan-home-heading-sparkle absolute" size={23} aria-hidden="true" />
                  <h1 className="text-center text-[30px] font-semibold tracking-tight sm:text-[36px]">
                    {currentLang === 'ar'
                      ? <>ما الذي يدور في بالك <span>اليوم؟</span></>
                      : <>What’s on your mind <span>today?</span></>}
                  </h1>
                </motion.div>
                <motion.p variants={homeChildVariants} className="bayan-home-subtitle mb-7 text-center text-sm leading-7 sm:text-base">
                  {currentLang === 'ar'
                    ? 'أنا Cintra، مساعدك الذكي. اكتب سؤالك أو اختر من الخيارات أدناه لبدء رحلتك.'
                    : 'I’m Cintra, your AI assistant. Ask a question or choose an option below to get started.'}
                </motion.p>
                <motion.div variants={homeChildVariants}>{chatInput}</motion.div>
                <motion.div variants={homeStaggerVariants} className="bayan-home-shortcuts mx-auto mt-9 grid w-full max-w-[896px] gap-4 sm:grid-cols-3">
                  <motion.button variants={homeChildVariants} type="button" onClick={openImageStudio} whileHover={reduceMotion ? undefined : { y: -2 }} transition={getMotionTransition(Boolean(reduceMotion), motionTiming.micro)} className="bayan-home-action-card group relative flex min-h-[140px] flex-col items-start rounded-[20px] px-5 py-4 text-start text-sm font-medium">
                    <span className="bayan-home-action-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><ImageIcon size={20} /></span>
                    <span className="bayan-home-action-title mt-2 block">{currentLang === 'ar' ? 'أنشئ صورة أو ملصقاً' : 'Create an image or sticker'}</span>
                    <span className="bayan-home-action-description mt-1 block">{currentLang === 'ar' ? 'حوّل أفكارك إلى صور مدهشة' : 'Turn your ideas into stunning images'}</span>
                    <ArrowRight className="bayan-home-action-arrow absolute bottom-4 left-4" size={17} aria-hidden="true" />
                  </motion.button>
                  <motion.button variants={homeChildVariants} type="button" onClick={openWritingWorkspace} whileHover={reduceMotion ? undefined : { y: -2 }} transition={getMotionTransition(Boolean(reduceMotion), motionTiming.micro)} className="bayan-home-action-card group relative flex min-h-[140px] flex-col items-start rounded-[20px] px-5 py-4 text-start text-sm font-medium">
                    <span className="bayan-home-action-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><PenLine size={20} /></span>
                    <span className="bayan-home-action-title mt-2 block">{currentLang === 'ar' ? 'اكتب أو حرّر' : 'Write or edit'}</span>
                    <span className="bayan-home-action-description mt-1 block">{currentLang === 'ar' ? 'أنشئ محتوى، عدّل النصوص وطوّر أفكارك' : 'Create content, edit text, and develop ideas'}</span>
                    <ArrowRight className="bayan-home-action-arrow absolute bottom-4 left-4" size={17} aria-hidden="true" />
                  </motion.button>
                  <motion.button variants={homeChildVariants} type="button" onClick={openWebResearch} whileHover={reduceMotion ? undefined : { y: -2 }} transition={getMotionTransition(Boolean(reduceMotion), motionTiming.micro)} className="bayan-home-action-card group relative flex min-h-[140px] flex-col items-start rounded-[20px] px-5 py-4 text-start text-sm font-medium">
                    <span className="bayan-home-action-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><Globe2 size={20} /></span>
                    <span className="bayan-home-action-title mt-2 block">{currentLang === 'ar' ? 'ابحث في الويب' : 'Search the web'}</span>
                    <span className="bayan-home-action-description mt-1 block">{currentLang === 'ar' ? 'احصل على أحدث المعلومات من الإنترنت' : 'Find the latest information on the web'}</span>
                    <ArrowRight className="bayan-home-action-arrow absolute bottom-4 left-4" size={17} aria-hidden="true" />
                  </motion.button>
                </motion.div>
              </motion.div>
            </motion.section>
          ) : (
            <>
          <section className="bayan-conversation-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-6">
          <AnimatePresence initial={false} mode="wait">
          {loadingChat ? (
              <motion.div
                key="conversation-loading"
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={getMotionTransition(Boolean(reduceMotion), motionTiming.component)}
                className="w-full max-w-3xl mx-auto px-4 py-8 flex-1 space-y-5"
                role="status"
                aria-label="Loading conversation"
              >
                <div className="flex justify-start"><div className="h-12 w-2/3 rounded-2xl bg-neutral-100 animate-pulse" /></div>
                <div className="space-y-3">
                  <div className="h-4 w-5/6 rounded bg-neutral-100 animate-pulse" />
                  <div className="h-4 w-4/6 rounded bg-neutral-100 animate-pulse" />
                  <div className="h-4 w-3/6 rounded bg-neutral-100 animate-pulse" />
                </div>
              </motion.div>
          ) : (
            <motion.div
              key="conversation-content"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={getMotionTransition(Boolean(reduceMotion), motionTiming.component)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <ConversationView
                messages={messages}
                userName={user.isGuest ? t('guestUser') : user.name}
                isStreaming={isStreaming}
                isThinking={isThinking}
                isReconnecting={isReconnecting}
                onRegenerate={handleRegenerate}
                onEditMessage={!isStreaming ? handleEditMessage : undefined}
                onSelectPrompt={(prompt) => handleSendMessage(prompt)}
                onFeedback={handleFeedback}
                onSendSuggestedReply={(reply) => { void handleSendMessage(reply); }}
                onRegenerateImage={handleRegenerateImage}
                onEditImage={handleEditImagePrompt}
                onDeleteImage={setImageToDelete}
                onOpenArtifacts={handleOpenArtifacts}
                studyMode={user?.studyModeEnabled ?? false}
                highlightUserMessages={user?.highlightUserMessages ?? true}
                highlightAssistantAnswers={user?.highlightAssistantAnswers ?? true}
                userMessageHighlightColor={user?.userMessageHighlightColor || '#818cf8'}
                assistantAnswerHighlightColor={user?.assistantAnswerHighlightColor || '#fbbf24'}
                ttsVoice={user?.ttsVoice || ''}
                ttsSpeed={user?.ttsSpeed || 1}
                preferredLanguage={user?.preferredLanguage || (currentLang === 'ar' ? 'ar-EG' : 'en-US')}
                expanded={chatExpanded}
              />
            </motion.div>
          )}
          </AnimatePresence>
          </section>
          {chatInput}
            </>
          )}
          </motion.div>
          <AnimatePresence initial={false}>
          {artifactPanelOpen && activeArtifacts.length > 0 && (
            <motion.div
              layout
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
              transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 200, damping: 25 }}
              className={`bayan-artifact-pane min-h-0 min-w-0 ${artifactMobileView === 'chat' ? 'is-mobile-hidden' : ''}`}
            >
              <ArtifactPanel
                key={`${artifactPanelMessageId || 'generated-artifacts'}-${artifactPanelArtifactId || ''}`}
                artifacts={activeArtifacts}
                initialSelectedId={artifactPanelArtifactId}
                onClose={() => {
                  setArtifactPanelOpen(false);
                  setArtifactMobileView('chat');
                }}
              />
            </motion.div>
          )}
          </AnimatePresence>
          </motion.div>
          </>
          )}
        </main>
      </div>
      {homeTaskMode && <HomeTaskDialog mode={homeTaskMode} onClose={() => setHomeTaskMode(null)} onSubmit={handleHomeTaskSubmit} />}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsInitialTab}
        thinkingEnabled={thinkingEnabled}
        onThinkingEnabledChange={handleThinkingModeChange}
      />
      <ConfirmDialog
        open={imageToDelete !== null}
        title={currentLang === 'ar' ? 'حذف الصورة؟' : 'Delete image?'}
        description={currentLang === 'ar'
          ? 'سيتم حذف الصورة المُنشأة من هذه المحادثة. لا يمكن التراجع عن هذا الإجراء.'
          : 'This generated image will be removed from this conversation. This action cannot be undone.'}
        confirmLabel={currentLang === 'ar' ? 'حذف الصورة' : 'Delete image'}
        cancelLabel={currentLang === 'ar' ? 'إلغاء' : 'Cancel'}
        onConfirm={() => imageToDelete ? handleDeleteImage(imageToDelete) : undefined}
        onClose={() => setImageToDelete(null)}
      />
      <ActionToast
        toast={actionToast}
        onDismiss={() => setActionToast(null)}
        isRtl={isRtl}
        language={currentLang}
      />
    </div>
  );
}

export default function App() {
  const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
  return (
    <LanguageProvider>
      <AuthProvider>
        {isAdminRoute ? <Suspense fallback={<div className="admin-login-stage">Loading administrator workspace…</div>}><AdminDashboard /></Suspense> : <Workspace />}
      </AuthProvider>
    </LanguageProvider>
  );
}
