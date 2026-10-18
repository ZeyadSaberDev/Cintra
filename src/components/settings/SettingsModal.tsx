import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage, LanguageMode } from '../../contexts/LanguageContext';
import {
  X,
  Sparkles,
  Sliders,
  User as UserIcon,
  Shield,
  KeyRound,
  Check,
  Download,
  Trash2,
  Coins,
  Volume2,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { ModelInfo } from '../../../lib/ai/provider';
import {
  isTypographyFont,
  readTypographyPreferences,
  saveTypographyPreferences,
  type TypographyFont,
  type TypographyPreferences,
} from '../../../lib/typography';
import { groupModelsByFamily } from '../../lib/modelGrouping';
import { readThemePreference, saveThemePreference, type ThemePreference } from '../../lib/theme';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'voice' | 'personalization' | 'plan' | 'data' | 'account';
  thinkingEnabled: boolean;
  onThinkingEnabledChange: (enabled: boolean) => void;
}

interface CloudTtsVoice {
  name: string;
  languageCodes: string[];
  ssmlGender: string;
}

interface BillingPlan {
  id: 'free' | 'pro' | 'pro_plus';
  name: string;
  description: string;
  prices: Array<{ interval: 'month' | 'year'; amount: number; currency: string; available: boolean }>;
}

interface BillingData {
  plans: BillingPlan[];
  currentPlan: 'free' | 'pro' | 'pro_plus';
  hasStripeCustomer: boolean;
  stripeConfigured: boolean;
  subscription: {
    plan: string;
    billingInterval: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  payments: Array<{
    stripeInvoiceId: string;
    amountPaid: number;
    currency: string;
    status: string;
    invoiceUrl: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
}

export function SettingsModal({ isOpen, onClose, initialTab = 'general', thinkingEnabled, onThinkingEnabledChange }: SettingsModalProps) {
  const { user, updateProfile, logout, refreshUser } = useAuth();
  const { mode, setLanguageMode, t, isRtl, currentLang } = useLanguage();

  const [activeTab, setActiveTab] = useState<'general' | 'voice' | 'personalization' | 'plan' | 'data' | 'account'>('general');
  const [name, setName] = useState(user?.name || '');
  const [customInstructions, setCustomInstructions] = useState(user?.customInstructions || '');
  const [tone, setTone] = useState(user?.tone || 'Conversational');
  const [responseLength, setResponseLength] = useState(user?.responseLength || 'Normal');
  const [writingStyle, setWritingStyle] = useState(user?.writingStyle || 'Simple');
  const [languageVariant, setLanguageVariant] = useState(user?.languageVariant || '');
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference(user?.theme || 'light'));
  const [accentColor, setAccentColor] = useState(user?.accentColor || '#6366f1');
  const [typography, setTypography] = useState<TypographyPreferences>(readTypographyPreferences);
  const [studyModeEnabled, setStudyModeEnabled] = useState(user?.studyModeEnabled ?? false);
  const [highlightUserMessages, setHighlightUserMessages] = useState(user?.highlightUserMessages ?? true);
  const [highlightAssistantAnswers, setHighlightAssistantAnswers] = useState(user?.highlightAssistantAnswers ?? true);
  const [userMessageHighlightColor, setUserMessageHighlightColor] = useState(user?.userMessageHighlightColor || '#818cf8');
  const [assistantAnswerHighlightColor, setAssistantAnswerHighlightColor] = useState(user?.assistantAnswerHighlightColor || '#fbbf24');
  const [voiceEnabled, setVoiceEnabled] = useState(user?.voiceEnabled ?? false);
  const [ttsVoice, setTtsVoice] = useState(user?.ttsVoice || '');
  const [ttsSpeed, setTtsSpeed] = useState(user?.ttsSpeed || 1);
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage || (mode === 'ar' ? 'ar-EG' : 'en-US'));
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [cloudVoices, setCloudVoices] = useState<CloudTtsVoice[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>(() => {
    return localStorage.getItem('bayan_default_model') || 'bayan-one';
  });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const accentSaveTimer = useRef<number | null>(null);
  const [modalMounted, setModalMounted] = useState(isOpen);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    let frame: number | undefined;
    let closeTimer: number | undefined;
    if (isOpen) {
      setModalMounted(true);
      frame = window.requestAnimationFrame(() => setModalVisible(true));
    } else {
      setModalVisible(false);
      closeTimer = window.setTimeout(() => setModalMounted(false), 220);
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setCustomInstructions(user.customInstructions || '');
      setTone(user.tone || 'Conversational');
      setResponseLength(user.responseLength || 'Normal');
      setWritingStyle(user.writingStyle || 'Simple');
      setLanguageVariant(user.languageVariant || '');
      setTheme(readThemePreference(user.theme || 'light'));
      setAccentColor(user.accentColor || '#6366f1');
      setStudyModeEnabled(user.studyModeEnabled ?? false);
      setHighlightUserMessages(user.highlightUserMessages ?? true);
      setHighlightAssistantAnswers(user.highlightAssistantAnswers ?? true);
      setUserMessageHighlightColor(user.userMessageHighlightColor || '#818cf8');
      setAssistantAnswerHighlightColor(user.assistantAnswerHighlightColor || '#fbbf24');
      setVoiceEnabled(user.voiceEnabled ?? false);
      setTtsVoice(user.ttsVoice || '');
      setTtsSpeed(user.ttsSpeed || 1);
      setPreferredLanguage(user.preferredLanguage || (mode === 'ar' ? 'ar-EG' : 'en-US'));
    }
  }, [user, mode]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const updateVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch('/api/tts/voices', { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 503) return { voices: [] };
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || 'Could not load speech voices.');
        return data;
      })
      .then((data) => setCloudVoices(Array.isArray(data.voices) ? data.voices : []))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Cloud speech voice list request failed:', error);
          setCloudVoices([]);
        }
      });
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => () => {
    if (accentSaveTimer.current !== null) window.clearTimeout(accentSaveTimer.current);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch('/api/models', { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Unable to load available models (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        if (data.models) setModels(data.models);
        if (!localStorage.getItem('bayan_default_model') && typeof data.defaultModel === 'string') {
          setDefaultModel(data.defaultModel);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Settings model list request failed:', error);
        }
      });
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'plan') return;
    const controller = new AbortController();
    setBillingLoading(true);
    setBillingError('');
    fetch('/api/subscription', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error?.message || 'Could not load subscription details.');
        return result as BillingData;
      })
      .then((result) => setBilling(result))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') setBillingError(error.message);
      })
      .finally(() => { if (!controller.signal.aborted) setBillingLoading(false); });
    return () => controller.abort();
  }, [isOpen, activeTab]);

  if (!modalMounted || !user) return null;

  const startCheckout = async (plan: 'pro' | 'pro_plus') => {
    setCheckoutPlan(plan);
    setBillingError('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval: plan === 'pro_plus' ? 'month' : billingInterval }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.checkoutUrl !== 'string') {
        throw new Error(result.error?.message || 'Could not start Stripe checkout.');
      }
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Could not start Stripe checkout.');
      setCheckoutPlan(null);
    }
  };

  const cancelSubscription = async () => {
    if (!window.confirm(currentLang === 'ar'
      ? 'هل تريد إلغاء التجديد؟ ستبقى الخطة فعالة حتى نهاية الفترة المدفوعة.'
      : 'Cancel renewal? Your plan remains active until the end of the paid period.')) return;
    setCancelingSubscription(true);
    setBillingError('');
    try {
      const response = await fetch('/api/subscription/cancel', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Could not cancel subscription renewal.');
      const refreshed = await fetch('/api/subscription');
      const billingResult = await refreshed.json().catch(() => ({}));
      if (!refreshed.ok) throw new Error(billingResult.error?.message || 'Subscription was canceled, but its status could not be refreshed.');
      setBilling(billingResult as BillingData);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Could not cancel subscription renewal.');
    } finally {
      setCancelingSubscription(false);
    }
  };

  const openBillingPortal = async () => {
    setBillingError('');
    try {
      const response = await fetch('/api/subscription/portal', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.portalUrl !== 'string') {
        throw new Error(result.error?.message || 'Could not open the billing portal.');
      }
      window.location.assign(result.portalUrl);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Could not open the billing portal.');
    }
  };

  const refreshBilling = async () => {
    setBillingLoading(true);
    setBillingError('');
    try {
      const response = await fetch('/api/subscription');
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Could not refresh subscription details.');
      setBilling(result as BillingData);
      await refreshUser();
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Could not refresh subscription details.');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setStatusMsg(null);
    const ok = await updateProfile({
      name,
      customInstructions,
      languagePreference: mode,
      tone,
      responseLength,
      writingStyle,
      languageVariant: languageVariant || null,
      theme,
      accentColor,
      studyModeEnabled,
      highlightUserMessages,
      highlightAssistantAnswers,
      userMessageHighlightColor,
      assistantAnswerHighlightColor,
      voiceEnabled,
      ttsVoice,
      ttsSpeed,
      preferredLanguage,
    });
    saveThemePreference(theme);
    localStorage.setItem('bayan_accent_color', accentColor);
    document.documentElement.style.setProperty('--bayan-accent', accentColor);
    localStorage.setItem('bayan_default_model', defaultModel);
    setIsSaving(false);
    if (ok) {
      setStatusMsg(t('changesSaved'));
      setTimeout(() => setStatusMsg(null), 2500);
    } else {
      setStatusMsg(t('profileSaveFailed'));
    }
  };

  const handleAccentColorChange = (nextColor: string) => {
    setAccentColor(nextColor);
    document.documentElement.style.setProperty('--bayan-accent', nextColor);
    localStorage.setItem('bayan_accent_color', nextColor);
    if (accentSaveTimer.current !== null) window.clearTimeout(accentSaveTimer.current);
    accentSaveTimer.current = window.setTimeout(() => {
      void updateProfile({ accentColor: nextColor }).then((saved) => {
        if (!saved) {
          const fallback = user.accentColor || '#6366f1';
          setAccentColor(fallback);
          document.documentElement.style.setProperty('--bayan-accent', fallback);
          localStorage.setItem('bayan_accent_color', fallback);
          setStatusMsg(t('accentColorSaveFailed'));
        }
      });
    }, 300);
  };

  const updateTypography = (changes: Partial<TypographyPreferences>) => {
    const next = { ...typography, ...changes };
    setTypography(next);
    saveTypographyPreferences(next);
  };

  const handleLanguageChange = (newMode: LanguageMode) => {
    setLanguageMode(newMode);
    const variantIsArabic = Boolean(languageVariant && !/English$/.test(languageVariant));
    const variantConflicts = newMode !== 'auto'
      && ((newMode === 'ar' && !variantIsArabic) || (newMode === 'en' && variantIsArabic));
    if (variantConflicts) {
      setLanguageVariant('');
      updateProfile({ languagePreference: newMode, languageVariant: null });
    } else {
      updateProfile({ languagePreference: newMode });
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    setStatusMsg(null);
    try {
      const listResponse = await fetch('/api/conversations');
      if (!listResponse.ok) throw new Error(`Conversation export failed with status ${listResponse.status}.`);
      const { conversations } = await listResponse.json();
      const exportedConversations = await Promise.all(
        conversations.map(async (conversation: { id: string }) => {
          const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}`);
          if (!response.ok) throw new Error(`Could not export conversation ${conversation.id}.`);
          return response.json();
        }),
      );
      const blob = new Blob(
        [JSON.stringify({
          user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
          conversations: exportedConversations,
          exportDate: new Date().toISOString(),
        }, null, 2)],
        { type: 'application/json' },
      );
      const objectUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = objectUrl;
      downloadAnchor.download = `bayan_export_${user.id}_${Date.now()}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Conversation export failed:', error);
      setStatusMsg(t('couldNotExportConversations'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleStudyModeChange = async (enabled: boolean) => {
    setStudyModeEnabled(enabled);
    setStatusMsg(null);
    const ok = await updateProfile({ studyModeEnabled: enabled });
    if (!ok) {
      setStudyModeEnabled(!enabled);
      setStatusMsg(t('studyModeSaveFailed'));
      return;
    }
    setStatusMsg(enabled
      ? t('studyModeStatusOn')
      : t('studyModeStatusOff'));
    window.setTimeout(() => setStatusMsg(null), 2500);
  };

  const handleExportStudyNotes = async () => {
    setIsExporting(true);
    setStatusMsg(null);
    try {
      const response = await fetch('/api/study/notes/export');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || `Study notes export failed with status ${response.status}.`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'bayan_study_notes.md';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setStatusMsg(t('studyNotesExported'));
    } catch (error) {
      console.error('Study notes export failed:', error);
      setStatusMsg(t('studyNotesExportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`bayan-modal-backdrop bayan-settings-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 ${modalVisible ? 'is-visible' : ''}`} aria-hidden={!modalVisible}>
      <div role="dialog" aria-modal="true" className={`bayan-modal-panel bayan-settings-modal bg-white text-neutral-900 w-full max-w-[760px] rounded-2xl shadow-xl border border-[#e5e5e5] flex flex-col overflow-hidden max-h-[min(88vh,760px)] ${modalVisible ? 'is-visible' : ''}`}>
        <div className="bayan-settings-layout flex flex-1 min-h-[440px] overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="bayan-settings-nav w-[190px] bg-neutral-50 p-4 flex flex-col justify-between shrink-0 border-r border-[#f0f0f0] rtl:border-r-0 rtl:border-l">
            <div className="space-y-4">
              <div className="px-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                {t('settings')}
              </div>
              <nav className="bayan-settings-tab-list space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className={`bayan-settings-tab w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left rtl:text-right ${
                    activeTab === 'general'
                      ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60'
                  }`}
                >
                  <Sliders size={16} />
                  <span>{t('generalSettings')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('voice')}
                  className={`bayan-settings-tab w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left rtl:text-right ${
                    activeTab === 'voice'
                      ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60'
                  }`}
                >
                  <Volume2 size={16} />
                  <span>{currentLang === 'ar' ? 'الصوت' : 'Voice'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('personalization')}
                  className={`bayan-settings-tab w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left rtl:text-right ${
                    activeTab === 'personalization'
                      ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60'
                  }`}
                >
                  <UserIcon size={16} />
                  <span>{t('personalization')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('plan')}
                  className={`bayan-settings-tab w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left rtl:text-right ${
                    activeTab === 'plan'
                      ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60'
                  }`}
                >
                  <Coins size={16} />
                  <span>{t('planAndCredits')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('data')}
                  className={`bayan-settings-tab w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left rtl:text-right ${
                    activeTab === 'data'
                      ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60'
                  }`}
                >
                  <Shield size={16} />
                  <span>{t('dataControls')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('account')}
                  className={`bayan-settings-tab w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left rtl:text-right ${
                    activeTab === 'account'
                      ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60'
                  }`}
                >
                  <KeyRound size={16} />
                  <span>{t('accountTab')}</span>
                </button>
              </nav>
            </div>

            <div className="px-2 text-[11px] text-neutral-400">
              Bayan v1.0 • {user.plan === 'pro_plus' ? 'Pro+' : user.plan === 'pro' ? t('proPlanName') : t('freePlanName')}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="bayan-settings-content flex-1 flex flex-col justify-between overflow-y-auto">
            <div className="bayan-settings-content-inner p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#f0f0f0]">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-neutral-400">
                    <img src="/cintra-icon.svg" alt="" aria-hidden="true" className="bayan-settings-brand-mark" />
                    <span>Cintra</span>
                  </div>
                  <h2 className="text-base font-semibold text-neutral-900">
                    {activeTab === 'general' && t('generalSettings')}
                    {activeTab === 'voice' && (currentLang === 'ar' ? 'الصوت' : 'Voice')}
                    {activeTab === 'personalization' && t('personalization')}
                    {activeTab === 'plan' && t('planAndCredits')}
                    {activeTab === 'data' && t('dataControls')}
                    {activeTab === 'account' && t('accountTab')}
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {activeTab === 'general' && t('languageSettingDesc')}
                    {activeTab === 'voice' && (currentLang === 'ar' ? 'إعدادات قراءة الردود بصوت مسموع.' : 'Choose how Bayan reads responses aloud.')}
                    {activeTab === 'personalization' && 'Customize how Bayan responds to your queries.'}
                    {activeTab === 'plan' && t('estimatedCreditsPerMessage')}
                    {activeTab === 'data' && 'Manage your conversations and privacy settings.'}
                    {activeTab === 'account' && t('accountSettings')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('close')}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Guest Session Notice */}
              {user.isGuest && (
                <div className="p-3.5 rounded-xl bg-neutral-100/90 border border-[#e5e5e5] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-neutral-800">
                    <Shield size={16} className="text-neutral-900 shrink-0" />
                    <span>{t('guestSettingsNotice')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      onClose();
                    }}
                    className="px-3 py-1 bg-neutral-900 text-white rounded-lg text-xs font-medium hover:bg-neutral-800 transition-colors shrink-0 ml-3 rtl:ml-0 rtl:mr-3 cursor-pointer"
                  >
                    {t('guestBannerCta')}
                  </button>
                </div>
              )}

              {/* General Tab */}
              {activeTab === 'general' && (
                <div className="space-y-5">
                  {/* Theme */}
                  <div className="bayan-appearance-card">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-neutral-900">{t('theme')}</div>
                      <div className="mt-1 text-xs text-neutral-500">{t('themeDescription')}</div>
                    </div>
                    <div className="bayan-theme-options" role="group" aria-label={t('theme')}>
                      {([
                        { value: 'light', label: t('lightTheme'), Icon: Sun },
                        { value: 'dark', label: t('darkTheme'), Icon: Moon },
                        { value: 'auto', label: t('autoTheme'), Icon: Monitor },
                      ] as const).map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={theme === value}
                          onClick={() => {
                            setTheme(value);
                            saveThemePreference(value);
                          }}
                          className={`bayan-theme-option ${theme === value ? 'is-selected' : ''}`}
                        >
                          <span className="bayan-theme-preview" data-preview={value}>
                            <span />
                            <span />
                            <span />
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Icon size={13} />
                            <span>{label}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bayan-appearance-card">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-neutral-900">{t('fontSettings')}</div>
                      <div className="mt-1 text-xs text-neutral-500">{t('fontSettingsDescription')}</div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-neutral-700">
                        {t('fontFamilyLabel')}
                        <select
                          value={typography.font}
                          onChange={(event) => {
                            if (isTypographyFont(event.target.value)) updateTypography({ font: event.target.value });
                          }}
                          className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-800"
                        >
                          <option value="bayan">{t('bayanFont')}</option>
                          <option value="system">{t('systemFont')}</option>
                          <option value="cairo">Cairo</option>
                          <option value="ibm-plex-sans-arabic">IBM Plex Sans Arabic</option>
                          <option value="readex-pro">Readex Pro</option>
                          <option value="inter">Inter</option>
                          <option value="noto-sans-arabic">Noto Sans Arabic</option>
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-neutral-700">
                        <span className="flex items-center justify-between gap-2">
                          <span>{t('fontSizeLabel')}</span>
                          <output className="font-normal tabular-nums text-neutral-500" aria-live="polite">{typography.size} px</output>
                        </span>
                        <input
                          type="range"
                          min={14}
                          max={24}
                          step={1}
                          value={typography.size}
                          onChange={(event) => updateTypography({ size: Number(event.target.value) })}
                          aria-label={t('fontSizeLabel')}
                          className="bayan-font-size-range mt-2"
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-4 border-t border-neutral-200 pt-3">
                      <div>
                        <div className="text-xs font-medium text-neutral-900">{t('boldTextLabel')}</div>
                        <div className="mt-0.5 text-[11px] text-neutral-500">{t('boldTextDescription')}</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={typography.bold}
                        aria-label={t('boldTextLabel')}
                        onClick={() => updateTypography({ bold: !typography.bold })}
                        className={`bayan-setting-switch ${typography.bold ? 'is-on' : ''}`}
                      >
                        <span className="bayan-setting-switch-thumb" />
                      </button>
                    </div>
                    <p className="bayan-font-preview mt-4 rounded-xl border border-neutral-200 bg-white/70 px-3 py-2.5 text-sm">
                      {t('fontPreview')}
                    </p>
                  </div>

                  <div className="bayan-appearance-card">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-neutral-900">{t('accentColorLabel')}</div>
                      <div className="mt-1 text-xs text-neutral-500">{t('accentColorDescription')}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2" aria-label={t('accentColorLabel')}>
                        {[
                          ['#6366f1', 'Indigo'],
                          ['#2563eb', 'Blue'],
                          ['#0891b2', 'Cyan'],
                          ['#059669', 'Emerald'],
                          ['#d97706', 'Amber'],
                          ['#e11d48', 'Rose'],
                        ].map(([color, label]) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`${label} ${t('accentColorLabel')}`}
                            aria-pressed={accentColor.toLowerCase() === color}
                            title={label}
                            onClick={() => handleAccentColorChange(color)}
                            className={`bayan-accent-swatch ${accentColor.toLowerCase() === color ? 'is-selected' : ''}`}
                            style={{ '--swatch-color': color } as React.CSSProperties}
                          />
                        ))}
                      </div>
                      <label className="bayan-custom-color">
                        <span>{t('chooseColor')}</span>
                        <input
                          type="color"
                          value={accentColor}
                          aria-label={t('accentColorLabel')}
                          onChange={(event) => handleAccentColorChange(event.target.value)}
                        />
                        <code>{accentColor.toUpperCase()}</code>
                      </label>
                    </div>
                  </div>

                  <div className="bayan-appearance-card">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-neutral-900">
                        {currentLang === 'ar' ? 'تمييز الرسائل' : 'Message highlights'}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {currentLang === 'ar' ? 'اختر تمييزًا للسؤال والإجابة أو أوقف أيًا منهما.' : 'Choose highlights for questions and answers independently.'}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {([
                        {
                          id: 'highlight-user-messages',
                          title: currentLang === 'ar' ? 'تمييز أسئلتي' : 'Highlight my questions',
                          description: currentLang === 'ar' ? 'خلفية لونية خفيفة لرسائلك.' : 'Use a subtle tint behind your messages.',
                          value: highlightUserMessages,
                          update: setHighlightUserMessages,
                          color: userMessageHighlightColor,
                          updateColor: setUserMessageHighlightColor,
                          colorLabel: currentLang === 'ar' ? 'لون تمييز السؤال' : 'Question highlight color',
                        },
                        {
                          id: 'highlight-assistant-answers',
                          title: currentLang === 'ar' ? 'تمييز الإجابات المهمة' : 'Highlight key answers',
                          description: currentLang === 'ar' ? 'إبراز العبارات المهمة في ردود Cintra.' : 'Emphasize important phrases in Cintra’s replies.',
                          value: highlightAssistantAnswers,
                          update: setHighlightAssistantAnswers,
                          color: assistantAnswerHighlightColor,
                          updateColor: setAssistantAnswerHighlightColor,
                          colorLabel: currentLang === 'ar' ? 'لون تمييز الإجابة' : 'Answer highlight color',
                        },
                      ]).map(({ id, title, description, value, update, color, updateColor, colorLabel }) => (
                        <div key={id} className="flex items-center justify-between gap-4 border-t border-neutral-200/70 pt-3 first:border-0 first:pt-0">
                          <div>
                            <label htmlFor={id} className="text-xs font-medium text-neutral-900">{title}</label>
                            <p className="mt-0.5 text-[11px] text-neutral-500">{description}</p>
                          </div>
                          <button
                            id={id}
                            type="button"
                            role="switch"
                            aria-checked={value}
                            aria-label={title}
                            onClick={() => update(!value)}
                            className={`bayan-setting-switch ${value ? 'is-on' : ''}`}
                          >
                            <span className="bayan-setting-switch-thumb" />
                          </button>
                          <label className="bayan-highlight-color-control">
                            <span className="sr-only">{colorLabel}</span>
                            <input
                              type="color"
                              value={color}
                              aria-label={colorLabel}
                              onChange={(event) => updateColor(event.target.value)}
                            />
                            <code>{color.toUpperCase()}</code>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#f5f5f5] pt-3">
                    <div>
                      <div className="text-xs font-medium text-neutral-900">{t('studyMode')}</div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">{t('studyModeDescription')}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={studyModeEnabled}
                      aria-label={t('studyMode')}
                      onClick={() => void handleStudyModeChange(!studyModeEnabled)}
                      className={`bayan-setting-switch ${studyModeEnabled ? 'is-on' : ''}`}
                    >
                      <span className="bayan-setting-switch-thumb" />
                    </button>
                  </div>
                  {studyModeEnabled && <div className="text-[10px] font-medium text-indigo-700">{t('studyModeStatusOn')}</div>}

                  <div className="flex items-center justify-between border-t border-[#f5f5f5] pt-3">
                    <div>
                      <div className="text-xs font-medium text-neutral-900">{t('languageVariant')}</div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">{t('languageVariantDescription')}</div>
                    </div>
                    <select value={languageVariant} onChange={(event) => setLanguageVariant(event.target.value)} className="max-w-56 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-800">
                      <option value="">{t('defaultVariant')}</option>
                      {(mode === 'ar' || (mode === 'auto' && isRtl)
                        ? [
                          ['Modern Standard Arabic (الفصحى)', 'العربية الفصحى'],
                          ['Egyptian Arabic (المصرية)', 'اللهجة المصرية'],
                          ['Gulf Arabic (الخليجية)', 'اللهجة الخليجية'],
                          ['Levantine Arabic (الشامية)', 'اللهجة الشامية'],
                          ['Moroccan Arabic (المغربية)', 'اللهجة المغربية'],
                        ]
                        : [['American English', 'American English'], ['British English', 'British English'], ['Australian English', 'Australian English']]
                      ).map(([variant, label]) => <option key={variant} value={variant}>{label}</option>)}
                    </select>
                  </div>

                  {/* Language Selector */}
                  <div className="flex items-start justify-between pt-3 border-t border-[#f5f5f5]">
                    <div>
                      <div className="text-xs font-medium text-neutral-900">{t('languageSettingLabel')}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{t('languageSettingDesc')}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="inline-flex rounded-xl bg-neutral-100 p-1 gap-1">
                        <button
                          type="button"
                          onClick={() => handleLanguageChange('auto')}
                          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                            mode === 'auto'
                              ? 'bg-white text-neutral-900 shadow-xs'
                              : 'text-neutral-600 hover:text-neutral-900'
                          }`}
                        >
                          {t('autoLanguage')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLanguageChange('en')}
                          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                            mode === 'en'
                              ? 'bg-white text-neutral-900 shadow-xs'
                              : 'text-neutral-600 hover:text-neutral-900'
                          }`}
                        >
                          {t('englishLtr')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLanguageChange('ar')}
                          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                            mode === 'ar'
                              ? 'bg-white text-neutral-900 shadow-xs'
                              : 'text-neutral-600 hover:text-neutral-900'
                          }`}
                        >
                          {t('arabicRtl')}
                        </button>
                      </div>
                      <span className="text-[10px] text-neutral-400">
                        {isRtl ? t('directionRtl') : t('directionLtr')}
                      </span>
                    </div>
                  </div>

                  {/* Default Model Selector */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#f5f5f5]">
                    <div>
                      <div className="text-xs font-medium text-neutral-900">{t('defaultModelSetting')}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">
                        {t('appliedToNewChats')}
                      </div>
                    </div>
                    <select
                      value={defaultModel}
                      onChange={(e) => {
                        setDefaultModel(e.target.value);
                        localStorage.setItem('bayan_default_model', e.target.value);
                      }}
                      className="px-3 py-1.5 text-xs bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:border-neutral-900"
                    >
                      {groupModelsByFamily(models).map(({ family, models: familyModels }) => (
                        <optgroup key={family} label={family}>
                          {familyModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'voice' && (
                <div className="space-y-5">
                  {!('speechSynthesis' in window) ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      {currentLang === 'ar' ? 'ميزة تحويل النص إلى صوت غير مدعومة في هذا المتصفح.' : 'Text-to-speech is not supported by this browser.'}
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-medium text-neutral-900">{currentLang === 'ar' ? 'قراءة الردود تلقائياً' : 'Speak responses automatically'}</div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">{currentLang === 'ar' ? 'يتم نطق رد Cintra بعد اكتماله.' : 'Speak each Cintra response after it finishes.'}</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={voiceEnabled}
                          aria-label={currentLang === 'ar' ? 'قراءة الردود تلقائياً' : 'Speak responses automatically'}
                          onClick={() => setVoiceEnabled((enabled) => !enabled)}
                          className={`bayan-setting-switch ${voiceEnabled ? 'is-on' : ''}`}
                        >
                          <span className="bayan-setting-switch-thumb" />
                        </button>
                      </div>
                      <label className="block border-t border-[#f5f5f5] pt-4">
                        <span className="text-xs font-medium text-neutral-900">{currentLang === 'ar' ? 'لغة النطق' : 'Speech language'}</span>
                        <select value={preferredLanguage} onChange={(event) => { setPreferredLanguage(event.target.value); setTtsVoice(''); }} className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800">
                          <option value="en-US">English (US)</option>
                          <option value="en-GB">English (UK)</option>
                          <option value="ar-EG">العربية (مصر)</option>
                          <option value="ar-SA">العربية (السعودية)</option>
                        </select>
                      </label>
                      <label className="block border-t border-[#f5f5f5] pt-4">
                        <span className="text-xs font-medium text-neutral-900">{currentLang === 'ar' ? 'الصوت' : 'Voice'}</span>
                        <select value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)} className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800">
                          <option value="">{currentLang === 'ar' ? 'الصوت الافتراضي' : 'System default'}</option>
                          {cloudVoices.length
                            ? cloudVoices.filter((voice) => voice.languageCodes.some((language) => language.toLowerCase().startsWith(preferredLanguage.slice(0, 2).toLowerCase()))).map((voice) => (
                              <option key={voice.name} value={voice.name}>{voice.name} · {voice.ssmlGender.toLowerCase()} · {voice.languageCodes[0]}</option>
                            ))
                            : availableVoices.filter((voice) => voice.lang.toLowerCase().startsWith(preferredLanguage.slice(0, 2).toLowerCase())).map((voice) => (
                              <option key={`${voice.name}:${voice.lang}`} value={voice.name}>{voice.name} · {voice.lang}</option>
                            ))}
                        </select>
                        <span className="mt-1 block text-[11px] text-neutral-500">{cloudVoices.length
                          ? (currentLang === 'ar' ? 'أصوات سحابية متاحة للتنزيل الصوتي.' : 'Cloud voices are used for downloadable audio.')
                          : (currentLang === 'ar' ? 'الأصوات المتاحة يحددها نظام التشغيل والمتصفح.' : 'Available voices are provided by your browser and operating system.')}</span>
                      </label>
                      <label className="block border-t border-[#f5f5f5] pt-4">
                        <span className="text-xs font-medium text-neutral-900">{currentLang === 'ar' ? 'سرعة النطق' : 'Speech speed'}</span>
                        <select value={ttsSpeed} onChange={(event) => setTtsSpeed(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800">
                          {[0.5, 1, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Personalization Tab */}
              {activeTab === 'personalization' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-[#f0f0f0] p-3">
                    <div>
                      <div className="text-xs font-medium text-neutral-900">{t('thinkingMode')}</div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">{t('thinkingModeDescription')}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={thinkingEnabled}
                      aria-label={t('thinkingMode')}
                      onClick={() => onThinkingEnabledChange(!thinkingEnabled)}
                      className={`bayan-setting-switch ${thinkingEnabled ? 'is-on' : ''}`}
                    >
                      <span className="bayan-setting-switch-thumb" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="space-y-1 text-xs font-medium text-neutral-700">
                      {t('tone')}
                      <select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)} className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs">
                        {([
                          ['Formal', t('formalTone')],
                          ['Conversational', t('conversationalTone')],
                          ['Creative', t('creativeTone')],
                          ['Academic', t('academicTone')],
                          ['Professional', t('professionalTone')],
                        ] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-neutral-700">
                      {t('responseLength')}
                      <select value={responseLength} onChange={(event) => setResponseLength(event.target.value as typeof responseLength)} className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs">
                        {([
                          ['Brief', t('briefLength')],
                          ['Normal', t('normalLength')],
                          ['Detailed', t('detailedLength')],
                        ] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-neutral-700">
                      {t('writingStyle')}
                      <select value={writingStyle} onChange={(event) => setWritingStyle(event.target.value as typeof writingStyle)} className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs">
                        {([
                          ['Simple', t('simpleStyle')],
                          ['Technical', t('technicalStyle')],
                          ['Poetic', t('poeticStyle')],
                          ['Casual', t('casualStyle')],
                        ] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-900 mb-1">
                      {t('customInstructions')}
                    </label>
                    <p className="text-[11px] text-neutral-500 mb-2">
                      {t('customInstructionsDescription')}
                    </p>
                    <textarea
                      rows={5}
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder={t('customInstructionsPlaceholder')}
                      className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 placeholder:text-neutral-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    {isSaving ? t('saving') : t('saveInstructions')}
                  </button>
                </div>
              )}

              {/* Data Controls Tab */}
              {activeTab === 'plan' && (
                <div className="space-y-4">
                  {billingError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{billingError}</div>}
                  {billingLoading && !billing && <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-500" role="status">{currentLang === 'ar' ? 'جارٍ تحميل تفاصيل الاشتراك…' : 'Loading subscription details…'}</div>}
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{currentLang === 'ar' ? 'خطتك الحالية' : 'Current plan'}</span>
                        <div className="mt-1 text-base font-semibold text-neutral-900">
                          {(billing?.currentPlan ?? user.plan) === 'pro_plus' ? 'Bayan Pro+' : (billing?.currentPlan ?? user.plan) === 'pro' ? 'Bayan Pro' : currentLang === 'ar' ? 'مجانية' : 'Free'}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-neutral-900">{user.creditBalance} {t('credits')}</span>
                    </div>
                    {billing?.subscription && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
                      <span>{currentLang === 'ar' ? 'الحالة:' : 'Status:'} {billing.subscription.status}{billing.subscription.currentPeriodEnd ? ` · ${currentLang === 'ar' ? 'حتى' : 'until'} ${new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}` : ''}</span>
                      <div className="flex flex-wrap gap-3">
                        {billing.subscription.cancelAtPeriodEnd
                          ? <span className="font-medium text-amber-700">{currentLang === 'ar' ? 'الإلغاء عند نهاية الفترة' : 'Cancels at period end'}</span>
                          : ['active', 'trialing'].includes(billing.subscription.status)
                            ? <button type="button" disabled={cancelingSubscription} onClick={() => void cancelSubscription()} className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50">{cancelingSubscription ? (currentLang === 'ar' ? 'جارٍ الإلغاء…' : 'Canceling…') : (currentLang === 'ar' ? 'إلغاء التجديد' : 'Cancel renewal')}</button>
                            : null}
                        {billing.hasStripeCustomer && billing.stripeConfigured && <button type="button" onClick={() => void openBillingPortal()} className="font-medium text-indigo-600 hover:underline">{currentLang === 'ar' ? 'إدارة الفوترة' : 'Manage billing'}</button>}
                      </div>
                    </div>}
                    <p className="mt-2 text-xs leading-5 text-neutral-600">{currentLang === 'ar' ? 'المجاني: 50 رسالة يومياً. Pro وPro+ يقدمان رسائل غير محدودة أثناء الاشتراك النشط.' : 'Free includes 50 messages per day. Pro and Pro+ include unlimited messages while the subscription is active.'}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900">{currentLang === 'ar' ? 'اختر خطتك' : 'Choose a plan'}</h3>
                    <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1">
                      {(['month', 'year'] as const).map((interval) => <button key={interval} type="button" onClick={() => setBillingInterval(interval)} aria-pressed={billingInterval === interval} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${billingInterval === interval ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>{interval === 'month' ? (currentLang === 'ar' ? 'شهري' : 'Monthly') : (currentLang === 'ar' ? 'سنوي' : 'Yearly')}</button>)}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(billing?.plans || []).map((plan) => {
                      const interval = plan.id === 'pro_plus' ? 'month' : billingInterval;
                      const price = plan.prices.find((item) => item.interval === interval);
                      const paidPlanId = plan.id === 'free' ? null : plan.id;
                      const isCurrent = (billing?.currentPlan ?? user.plan) === plan.id;
                      const planName = plan.id === 'pro_plus' ? 'Pro+' : plan.id === 'pro' ? 'Pro' : (currentLang === 'ar' ? 'مجانية' : 'Free');
                      const amount = price ? new Intl.NumberFormat(currentLang === 'ar' ? 'ar-EG' : 'en-US', {
                        style: 'currency',
                        currency: price.currency.toUpperCase(),
                        maximumFractionDigits: 2,
                      }).format(price.amount / 100) : null;
                      const bullets = plan.id === 'free'
                        ? (currentLang === 'ar' ? ['50 رسالة يومياً', 'محادثات أساسية', 'لا يلزم الدفع'] : ['50 messages per day', 'Core chat features', 'No payment required'])
                        : plan.id === 'pro'
                          ? (currentLang === 'ar' ? ['رسائل غير محدودة', 'كل النماذج المتاحة', 'أولوية في التحويل الاحتياطي'] : ['Unlimited messages', 'All available models', 'Priority provider failover'])
                          : (currentLang === 'ar' ? ['كل مزايا Pro', 'أولوية ودعم موسع', 'ميزات متقدمة'] : ['Everything in Pro', 'Priority and expanded support', 'Advanced features']);
                      return <section key={plan.id} className={`flex flex-col rounded-xl border p-3 ${isCurrent ? 'border-indigo-300 bg-indigo-50/60' : 'border-neutral-200 bg-white'}`}>
                        <div className="flex items-center justify-between gap-1"><h4 className="text-sm font-semibold text-neutral-900">{planName}</h4>{isCurrent && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-semibold text-indigo-700">{currentLang === 'ar' ? 'الحالية' : 'Current'}</span>}</div>
                        <div className="mt-2 text-xl font-bold text-neutral-900">{plan.id === 'free' ? (currentLang === 'ar' ? 'مجاناً' : 'Free') : amount || '—'}{plan.id !== 'free' && <span className="ms-1 text-[10px] font-normal text-neutral-500">/{interval === 'year' ? (currentLang === 'ar' ? 'سنة' : 'year') : (currentLang === 'ar' ? 'شهر' : 'month')}</span>}</div>
                        {plan.id === 'pro' && interval === 'year' && <span className="mt-1 text-[10px] text-emerald-700">{currentLang === 'ar' ? '99 دولاراً سنوياً — وفّر 20.88 دولاراً' : 'Save $20.88 vs monthly billing'}</span>}
                        <ul className="my-3 flex-1 space-y-1.5 text-[10px] text-neutral-600">{bullets.map((bullet) => <li key={bullet}>✓ {bullet}</li>)}</ul>
                        {plan.id === 'free'
                          ? <button type="button" disabled className="rounded-lg border border-neutral-200 px-2 py-2 text-[11px] text-neutral-500">{isCurrent ? (currentLang === 'ar' ? 'خطتك الحالية' : 'Current plan') : (currentLang === 'ar' ? 'مجانية' : 'Free')}</button>
                          : <button type="button" disabled={isCurrent || user.isGuest || !billing?.stripeConfigured || !price?.available || Boolean(checkoutPlan)} onClick={() => { if (paidPlanId) void startCheckout(paidPlanId); }} className="rounded-lg bg-neutral-900 px-2 py-2 text-[11px] font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45">
                            {checkoutPlan === plan.id ? (currentLang === 'ar' ? 'جارٍ التحويل للدفع…' : 'Opening checkout…')
                              : isCurrent ? (currentLang === 'ar' ? 'الخطة الحالية' : 'Current plan')
                                : user.isGuest ? (currentLang === 'ar' ? 'سجّل حساباً للاشتراك' : 'Create an account to subscribe')
                                  : !billing?.stripeConfigured ? (currentLang === 'ar' ? 'الدفع غير مهيأ' : 'Billing not configured')
                                    : !price?.available ? (currentLang === 'ar' ? 'غير متاح حالياً' : 'Unavailable')
                                      : (currentLang === 'ar' ? 'اشترك الآن' : 'Subscribe')}</button>}
                      </section>;
                    })}
                    {!billing?.plans.length && !billingLoading && <p className="col-span-full text-xs text-neutral-500">{currentLang === 'ar' ? 'تعذر تحميل الخطط.' : 'Could not load plans.'}</p>}
                  </div>
                  <div className="rounded-xl border border-neutral-200 p-4">
                    <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-neutral-900">{currentLang === 'ar' ? 'سجل الفواتير' : 'Billing history'}</h3><button type="button" disabled={billingLoading} onClick={() => void refreshBilling()} className="text-[10px] text-indigo-600 disabled:opacity-50">{currentLang === 'ar' ? 'تحديث' : 'Refresh'}</button></div>
                    {billing?.payments.length
                      ? <div className="divide-y divide-neutral-100">{billing.payments.map((payment) => <div key={payment.stripeInvoiceId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]"><span className="text-neutral-600">{new Date(payment.paidAt || payment.createdAt).toLocaleDateString()}</span><span className="font-medium text-neutral-900">{new Intl.NumberFormat(currentLang === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: payment.currency.toUpperCase() }).format(payment.amountPaid / 100)}</span><span className={payment.status === 'paid' ? 'text-emerald-700' : 'text-red-600'}>{payment.status}</span>{payment.invoiceUrl && <a href={payment.invoiceUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{currentLang === 'ar' ? 'عرض الفاتورة' : 'View invoice'}</a>}</div>)}</div>
                      : <p className="text-[11px] text-neutral-500">{currentLang === 'ar' ? 'لا توجد فواتير بعد.' : 'No invoices yet.'}</p>}
                  </div>
                  <div className="rounded-xl border border-neutral-200 p-4">
                    <h3 className="mb-3 text-xs font-semibold text-neutral-900">{t('estimatedCreditsPerMessage')}</h3>
                    <div className="divide-y divide-neutral-100 text-xs">
                      {[
                        [t('highTierModels'), t('creditsPerMessage', { credits: 8 })],
                        [t('mediumTierModels'), t('creditsPerMessage', { credits: 4 })],
                        [t('lowTierModels'), t('creditsPerMessage', { credits: 1 })],
                      ].map(([model, price]) => (
                        <div key={model} className="flex items-start justify-between gap-3 py-2 text-neutral-700"><span>{model}</span><span className="shrink-0 font-medium">{price}</span></div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-neutral-400">{t('creditPriceDisclaimer')}</p>
                  </div>
                </div>
              )}

              {/* Data Controls Tab */}
              {activeTab === 'data' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-[#f0f0f0]">
                    <div>
                      <div className="text-xs font-medium text-neutral-900">{t('exportAllData')}</div>
                      <div className="text-[11px] text-neutral-500">
                        {user.isGuest
                          ? t('guestExportDisabled')
                          : t('exportDataDescription')}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={user.isGuest || isExporting}
                      onClick={handleExportData}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-xs ${
                        user.isGuest
                          ? 'bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed'
                          : 'bg-white border border-[#e5e5e5] text-neutral-900 hover:bg-neutral-100 cursor-pointer'
                      }`}
                    >
                      <Download size={14} />
                      <span>{isExporting ? t('exporting') : t('exportJson')}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[#f0f0f0] bg-neutral-50 p-3">
                    <div>
                      <div className="text-xs font-medium text-neutral-900">{t('exportStudyNotes')}</div>
                      <div className="text-[11px] text-neutral-500">{t('studyNotesExportDescription')}</div>
                    </div>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => void handleExportStudyNotes()}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-xs transition-colors hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-50"
                    >
                      <Download size={14} />
                      <span>{isExporting ? t('exporting') : t('exportMarkdown')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-neutral-50 border border-[#f0f0f0] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">{t('accountType')}:</span>
                      <span className="font-semibold text-neutral-900">
                        {user.isGuest ? t('temporaryGuestSession') : t('registeredUser')}
                      </span>
                    </div>
                    {!user.isGuest && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500">{t('email')}:</span>
                        <span className="font-medium text-neutral-900">{user.email}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">{t('planLabel')}:</span>
                      <span className="font-semibold text-neutral-900 uppercase">
                        {user.plan === 'pro_plus' ? 'Pro+' : user.plan === 'free' ? t('freePlanName') : t('proPlanName')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">{t('creditsLabel')}:</span>
                      <span className="font-medium text-neutral-900">{user.creditBalance} {t('credits')}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    {user.isGuest ? (
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          onClose();
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 transition-colors"
                      >
                        Create Permanent Account
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          onClose();
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                      >
                        {t('logout')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {statusMsg && (
                <div className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                  {statusMsg}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-neutral-50 border-t border-[#f0f0f0] flex items-center justify-between">
              <span className="text-[11px] text-neutral-400">{t('changesSaveAuto')}</span>
              <button
                type="button"
                onClick={() => {
                  handleSaveProfile();
                  onClose();
                }}
                className="h-8 px-5 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-medium transition-colors shadow-xs"
              >
                {t('done')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
