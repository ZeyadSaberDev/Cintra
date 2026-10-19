import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Search, Check, Loader2 } from 'lucide-react';
import { MODEL_COSTS } from '../../../lib/config/modelCosts';
import { getModelFamily, groupModelsByFamily, normalizePublicModelCatalog, type GroupableModel } from '../../lib/modelGrouping';
import { useLanguage } from '../../contexts/LanguageContext';

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  placement?: 'below' | 'above';
}

export function ModelSelector({ selectedModel, onSelectModel, placement = 'below' }: ModelSelectorProps) {
  const { t, currentLang } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<GroupableModel[]>([]);
  const [modelCatalogStatus, setModelCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties | null>(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    if (window.innerWidth <= 640) {
      setMenuPosition({
        position: 'fixed',
        top: 'auto',
        right: margin,
        bottom: 'max(8px, env(safe-area-inset-bottom))',
        left: margin,
        width: `calc(100vw - ${margin * 2}px)`,
        maxHeight: 'min(70dvh, 440px)',
      });
      return;
    }
    const width = Math.min(340, window.innerWidth - margin * 2);
    const headerBottom = trigger.closest('header')?.getBoundingClientRect().bottom ?? rect.bottom;
    const availableHeight = placement === 'above'
      ? Math.max(100, rect.top - margin * 2)
      : Math.max(100, window.innerHeight - Math.max(rect.bottom + margin, headerBottom + 4) - margin);
    const height = Math.min(440, availableHeight);
    const top = placement === 'above'
      ? Math.max(margin, rect.top - height - margin)
      : Math.max(rect.bottom + margin, headerBottom + 4);
    const isRtl = document.documentElement.dir === 'rtl';
    const alignedLeft = isRtl ? rect.right - width : rect.left;
    const left = Math.max(margin, Math.min(alignedLeft, window.innerWidth - width - margin));
    setMenuPosition({ position: 'fixed', top, left, width, maxHeight: height });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/models', { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Unable to load available models (${res.status}).`);
        return res.json();
      })
      .then((data: unknown) => {
        if (!data || typeof data !== 'object' || !Array.isArray((data as { models?: unknown }).models)) {
          throw new Error('The model catalog response is invalid.');
        }
        setModels(normalizePublicModelCatalog((data as { models: unknown }).models));
        setModelCatalogStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Could not load the configured model catalog:', error);
        setModelCatalogStatus('error');
      });
    return () => controller.abort();
  }, [catalogRetry]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current
        && !containerRef.current.contains(event.target as Node)
        && !menuRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition, true);
      updateMenuPosition();
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen]);

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getModelFamily(m).toLowerCase().includes(searchQuery.toLowerCase())
  );
  const groupedModels = groupModelsByFamily(filteredModels);

  const currentModelObj = models.find((m) => m.id === selectedModel);
  const displayName = currentModelObj?.name || selectedModel || t('modelSelector');
  const currentCost = currentModelObj?.costTier ? MODEL_COSTS[currentModelObj.costTier] : null;
  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (!(event.target instanceof HTMLElement)) return;
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
    if (!options.length) return;
    const focusedIndex = options.indexOf(event.target as HTMLButtonElement);
    const fromSearch = event.target instanceof HTMLInputElement;
    if (!fromSearch && focusedIndex < 0) return;
    event.preventDefault();
    const selectedIndex = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
    const nextIndex = fromSearch
      ? selectedIndex >= 0 ? selectedIndex : 0
      : event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (focusedIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-busy={modelCatalogStatus === 'loading'}
        onClick={() => setIsOpen((open) => !open)}
        title={currentCost
          ? `${displayName} · ${t(`${currentCost.tier.toLowerCase()}Tier`)} · ${t('modelCostTooltip', { credits: currentCost.credits })}`
          : displayName}
        className="bayan-model-trigger flex h-8 max-w-[min(46vw,290px)] min-w-0 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-2 text-xs font-medium text-neutral-800 shadow-xs transition-colors hover:bg-neutral-50 sm:max-w-[min(60vw,290px)] sm:px-3"
      >
        <span className="bayan-model-name min-w-0 truncate max-w-[130px] sm:max-w-[200px]">{displayName}</span>
        <span className="bayan-model-compact-name hidden min-w-0 shrink-0 truncate">{displayName}</span>
        {currentCost && (
          <span className={`bayan-model-cost flex shrink-0 items-center gap-1 ${currentCost.colorClass}`}>
            <span aria-hidden="true">{currentCost.icon}</span>
            <span className="bayan-model-cost-label">{t(`${currentCost.tier.toLowerCase()}Tier`)}</span>
          </span>
        )}
        <ChevronDown size={14} className="text-neutral-500 shrink-0" />
      </button>

      {createPortal(
        <AnimatePresence>
        {isOpen && menuPosition && (
        <motion.div
          ref={menuRef}
          data-placement={placement}
          style={menuPosition}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: window.innerWidth <= 640 ? 24 : 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: window.innerWidth <= 640 ? 18 : 8, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          role="dialog"
          aria-label={currentLang === 'ar' ? 'اختيار النموذج' : 'Choose a model'}
          aria-busy={modelCatalogStatus === 'loading'}
          onKeyDown={handleOptionKeyDown}
          className="bayan-model-menu rounded-xl shadow-xl border z-[100] flex flex-col overflow-hidden"
        >
          {/* Search Header */}
          <div className="bayan-model-menu-header p-2 border-b">
            <div className="bayan-model-menu-search flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs text-neutral-800">
              <Search size={14} className="text-neutral-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchModels')}
                className="w-full bg-transparent border-0 outline-none text-xs placeholder:text-neutral-400"
              />
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
            role="listbox"
            aria-label={t('modelSelector')}
            aria-busy={modelCatalogStatus === 'loading'}
          >
            {modelCatalogStatus === 'loading' ? (
              <div className="flex items-center justify-center gap-2 p-5 text-xs text-neutral-500" role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                <span>{currentLang === 'ar' ? 'جارٍ تحميل النماذج…' : 'Loading configured models…'}</span>
              </div>
            ) : modelCatalogStatus === 'error' ? (
              <div className="space-y-3 p-4 text-center text-xs text-neutral-500" role="alert">
                <p>{currentLang === 'ar' ? 'تعذر تحميل النماذج المتاحة.' : 'Could not load available models.'}</p>
                <button
                  type="button"
                  onClick={() => { setModelCatalogStatus('loading'); setCatalogRetry((attempt) => attempt + 1); }}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  {currentLang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            ) : groupedModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-400">{t('noMatchingModels')}</div>
            ) : (
              groupedModels.map(({ family, models: familyModels }) => (
                <div key={family} className="space-y-0.5">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    {family}
                  </div>
                  {familyModels.map((m) => {
                    const isSelected = m.id === selectedModel;
                    const cost = m.costTier ? MODEL_COSTS[m.costTier] : null;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectModel(m.id);
                          setIsOpen(false);
                        }}
                        role="option"
                        aria-selected={isSelected}
                        className={`w-full min-w-0 flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left rtl:text-right ${
                          isSelected
                            ? 'bg-neutral-100 font-semibold text-neutral-900'
                            : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isSelected ? 'bg-neutral-900' : 'bg-neutral-300'
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="block truncate">{m.name}</span>
                            {m.description && <span className="mt-0.5 block truncate text-[10px] font-normal text-neutral-400">{m.description}</span>}
                          </span>
                          {cost && (
                            <span className={`ml-auto flex shrink-0 items-center gap-1 pl-2 text-[10px] ${cost.colorClass}`}>
                              <span aria-hidden="true">{cost.icon}</span>
                              <span>{t(`${cost.tier.toLowerCase()}Tier`)}</span>
                            </span>
                          )}
                        </div>
                        {isSelected && <Check size={14} className="text-neutral-900 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </motion.div>
        )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
