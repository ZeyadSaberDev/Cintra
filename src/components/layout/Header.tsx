import React from 'react';
import { ModelSelector } from '../chat/ModelSelector';
import { useLanguage } from '../../contexts/LanguageContext';
import { BookOpen, Globe2, Maximize2, Menu, Minimize2, Share2 } from 'lucide-react';
import { useBayanAlert } from '../../contexts/AlertContext';

interface HeaderProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onShare?: () => void;
  onToggleSidebar: () => void;
  isChatExpanded: boolean;
  onToggleChatWidth: () => void;
  studyMode?: boolean;
}

export function Header({ selectedModel, onSelectModel, onShare, onToggleSidebar, isChatExpanded, onToggleChatWidth, studyMode = false }: HeaderProps) {
  const { currentLang, setLanguageMode, t } = useLanguage();
  const showAlert = useBayanAlert();

  return (
    <header className="bayan-header relative z-20 flex h-14 shrink-0 select-none items-center justify-end border-b border-[#f0f0f0] bg-white/90 px-3 backdrop-blur-md sm:px-6">
      <div className="flex w-full min-w-0 items-center justify-between gap-0 sm:w-auto sm:justify-start sm:gap-3">
        {studyMode && (
          <span title={t('studyModeOn')} className="bayan-accent-soft inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium">
            <BookOpen size={14} />
            <span className="hidden sm:inline">{t('studyMode')}</span>
          </span>
        )}
        <div role="group" aria-label={currentLang === 'ar' ? 'لغة الواجهة' : 'Interface language'} dir="ltr" className="bayan-language-selector flex h-9 shrink-0 items-center gap-0.5 rounded-xl border border-neutral-200 bg-neutral-100/80 p-1 text-xs text-neutral-600 shadow-sm">
          <Globe2 size={14} className="mx-1 shrink-0 text-neutral-500" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setLanguageMode('en')}
            aria-label={t('englishOption')}
            aria-pressed={currentLang === 'en'}
            title={t('englishOption')}
            className={`flex h-7 min-w-10 items-center justify-center rounded-lg px-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              currentLang === 'en' ? 'bg-white font-semibold text-neutral-900 shadow-sm' : 'text-neutral-500 hover:bg-white/60 hover:text-neutral-900'
            }`}
          >
            <span className="bayan-header-language-full">{t('englishOption')}</span>
            <span className="bayan-header-language-short" aria-hidden="true">EN</span>
          </button>
          <button
            type="button"
            onClick={() => setLanguageMode('ar')}
            aria-label={t('arabicOption')}
            aria-pressed={currentLang === 'ar'}
            title={t('arabicOption')}
            className={`flex h-7 min-w-10 items-center justify-center rounded-lg px-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              currentLang === 'ar' ? 'bg-white font-semibold text-neutral-900 shadow-sm' : 'text-neutral-500 hover:bg-white/60 hover:text-neutral-900'
            }`}
          >
            <span className="bayan-header-language-full">{t('arabicOption')}</span>
            <span className="bayan-header-language-short" aria-hidden="true">ع</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onShare || (() => showAlert(t('startConversationToShare'), 'info', currentLang))}
          className="bayan-header-share flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:px-3"
        >
          <Share2 size={15} />
          <span className="hidden sm:inline">{t('share')}</span>
        </button>

        <button
          type="button"
          onClick={onToggleChatWidth}
          aria-label={isChatExpanded ? t('collapseChat') : t('expandChat')}
          aria-pressed={isChatExpanded}
          title={isChatExpanded ? t('collapseChat') : t('expandChat')}
          className="bayan-header-width-toggle flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          {isChatExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        <div className="bayan-header-model min-w-0 shrink">
          <ModelSelector selectedModel={selectedModel} onSelectModel={onSelectModel} />
        </div>

        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={t('toggleSidebar')}
          title={t('toggleSidebar')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}
