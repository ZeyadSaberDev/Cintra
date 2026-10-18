import React from 'react';
import { ModelSelector } from '../chat/ModelSelector';
import { useLanguage } from '../../contexts/LanguageContext';
import { BookOpen, Globe2, Maximize2, Menu, Minimize2, Settings, Share2 } from 'lucide-react';
import { useBayanAlert } from '../../contexts/AlertContext';

interface HeaderProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onShare?: () => void;
  onToggleSidebar: () => void;
  isChatExpanded: boolean;
  onToggleChatWidth: () => void;
  onOpenSettings: () => void;
  studyMode?: boolean;
}

export function Header({ selectedModel, onSelectModel, onShare, onToggleSidebar, isChatExpanded, onToggleChatWidth, onOpenSettings, studyMode = false }: HeaderProps) {
  const { currentLang, setLanguageMode, t } = useLanguage();
  const showAlert = useBayanAlert();

  return (
    <header className="bayan-header relative z-20 flex h-16 shrink-0 select-none items-center justify-center px-3 sm:px-6">
      <div className="bayan-header-leading absolute start-3 flex items-center gap-2 sm:start-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={t('toggleSidebar')}
          title={t('toggleSidebar')}
          className="bayan-header-floating-action"
        >
          <Menu size={18} />
        </button>
        {studyMode && (
          <span title={t('studyModeOn')} className="bayan-accent-soft inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium">
            <BookOpen size={14} />
            <span className="hidden sm:inline">{t('studyMode')}</span>
          </span>
        )}
      </div>
      <div className="bayan-header-model absolute left-1/2 min-w-0 -translate-x-1/2">
        <ModelSelector selectedModel={selectedModel} onSelectModel={onSelectModel} />
      </div>
      <div className="bayan-header-actions absolute end-3 flex items-center gap-1.5 sm:end-6 sm:gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={currentLang === 'ar' ? 'الإعدادات' : 'Settings'}
          title={currentLang === 'ar' ? 'الإعدادات' : 'Settings'}
          className="bayan-header-floating-action"
        >
          <Settings size={17} />
        </button>
        <div role="group" aria-label={currentLang === 'ar' ? 'لغة الواجهة' : 'Interface language'} dir="ltr" className="bayan-language-selector flex h-9 shrink-0 items-center gap-0.5 rounded-full p-1 text-xs">
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
          onClick={onToggleChatWidth}
          aria-label={isChatExpanded ? t('collapseChat') : t('expandChat')}
          aria-pressed={isChatExpanded}
          title={isChatExpanded ? t('collapseChat') : t('expandChat')}
          className="bayan-header-floating-action bayan-header-width-toggle"
        >
          {isChatExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          type="button"
          onClick={onShare || (() => showAlert(t('startConversationToShare'), 'info', currentLang))}
          aria-label={t('share')}
          title={t('share')}
          className="bayan-header-floating-action bayan-header-share"
        >
          <Share2 size={15} />
        </button>
      </div>
    </header>
  );
}
